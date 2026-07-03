// PRD §4.3 — automated expense verification. The rule engine is pure +
// explainable (never a black box): it returns every rule outcome for audit.
// An optional Claude vision pass extracts amount/date/vendor from the receipt.

import type { AiScoreFactor, FraudSignal, OcrField, VerificationResult } from "@/db/schema";
import { receiptVerdictEnum } from "@/db/schema";
import { fyBounds } from "@/lib/fy";
import { formatINR } from "@/lib/format";

// Re-exported for callers/tests that import it from the verification module.
export { fyBounds };

export type ClaimVerificationInput = {
  hasDocument: boolean;
  isDuplicate: boolean;
  claimedPaise: number;
  extractedPaise: number | null;
  expenseDate: string; // ISO
  /** A date inside the FY the claim is filed against (e.g. today). */
  referenceDate: string; // ISO
  availablePaise: number;
  vendor: string;
  ocrConfidence: number; // 0..1
  tolerancePaise?: number;
  minConfidence?: number;
  /** OCR-extracted fields to persist alongside the rule outcomes (KAN-42). */
  extracted?: { amountPaise: number | null; date: string | null; vendor: string | null };
};

/** Run the explainable rule checks. Pass = every rule ok → eligible for auto-approve. */
export function runRuleChecks(input: ClaimVerificationInput): VerificationResult {
  const tolerance = input.tolerancePaise ?? 0;
  const minConfidence = input.minConfidence ?? 0.7;
  // The expense date must fall within the *current* FY, not its own.
  const { start, end } = fyBounds(input.referenceDate);
  const inFY = input.expenseDate >= start && input.expenseDate <= end;
  const amountMatches =
    input.extractedPaise !== null &&
    Math.abs(input.extractedPaise - input.claimedPaise) <= tolerance;

  const checks: VerificationResult["checks"] = [
    { label: "File readable", ok: input.hasDocument, detail: input.hasDocument ? "Document present" : "No document uploaded" },
    { label: "Not a duplicate", ok: !input.isDuplicate, detail: input.isDuplicate ? "Matches a prior upload hash" : "No prior match" },
    { label: "Amount matches receipt", ok: amountMatches, detail: amountMatches ? "OCR amount within tolerance" : "Claimed amount differs from receipt" },
    { label: "Within current FY", ok: inFY, detail: inFY ? input.expenseDate : "Date outside current FY" },
    { label: "Balance sufficient", ok: input.claimedPaise <= input.availablePaise, detail: input.claimedPaise <= input.availablePaise ? "Within remaining balance" : "Exceeds remaining balance" },
    { label: "Vendor / category sanity", ok: input.vendor.trim().length >= 3, detail: input.vendor.trim().length >= 3 ? "Looks consistent" : "Vendor missing/unclear" },
    { label: "OCR confidence", ok: input.ocrConfidence >= minConfidence, detail: `${Math.round(input.ocrConfidence * 100)}% confidence` },
  ];

  return {
    passed: checks.every((c) => c.ok),
    checks,
    ocrConfidence: input.ocrConfidence,
    ...(input.extracted ? { extracted: input.extracted } : {}),
  };
}

// ---- KAN-111: AI confidence score + fraud signals ----
// Additive, explainable layer on top of `runRuleChecks` — every point on the
// score traces back to a named rule outcome, so it stays auditable (never a
// black-box LLM score). Computed once per submission (KAN-115) and persisted
// to `receiptVerifications`, independent of the pass/fail auto-approve gate.

export type AiVerdict = (typeof receiptVerdictEnum.enumValues)[number];
export type AiScoreResult = { score: number; verdict: AiVerdict; factors: AiScoreFactor[] };

// How much each rule outcome moves the score, off a neutral 50 baseline. The
// weights sum to 50 (a passing check adds its weight, a failing one subtracts
// it) so a fully clean claim lands exactly at 100 instead of saturating the
// clamp on the first check — otherwise every claim with at most one minor flag
// would score identically to a perfect one. Duplicate detection is weighted
// heaviest — it's the single strongest fraud indicator this engine can check.
const CHECK_WEIGHTS: Record<string, number> = {
  "File readable": 3,
  "Not a duplicate": 15,
  "Amount matches receipt": 10,
  "Within current FY": 5,
  "Balance sufficient": 8,
  "Vendor / category sanity": 4,
  "OCR confidence": 5,
};
const DEFAULT_CHECK_WEIGHT = 5;
const BASELINE_SCORE = 50;

/** Deterministic 0-100 confidence score + verdict, explained by per-check factors. */
export function computeAiScore(
  checks: VerificationResult["checks"],
  opts: { isDuplicate: boolean },
): AiScoreResult {
  let score = BASELINE_SCORE;
  const factors: AiScoreFactor[] = [];
  for (const check of checks) {
    const weight = CHECK_WEIGHTS[check.label] ?? DEFAULT_CHECK_WEIGHT;
    const delta = check.ok ? weight : -weight;
    score += delta;
    factors.push({
      label: check.ok ? `${check.label} — ${check.detail}` : `${check.label} failed — ${check.detail}`,
      delta,
      positive: check.ok,
    });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  // A duplicate always recommends reject, regardless of how the other checks land.
  // The approve threshold is deliberately close to 100: any real rule failure
  // already routes the claim to HR (see runRuleChecks), so the score should only
  // read "approve" for a genuinely clean claim — never for one sitting in the
  // HR queue with an open flag.
  const verdict: AiVerdict = opts.isDuplicate ? "reject" : score >= 95 ? "approve" : score >= 55 ? "review" : "reject";
  return { score, verdict, factors };
}

// Rule check → fraud signal mapping. Only covers things this engine can
// honestly derive from real data — no fabricated forensics (e.g. no image
// tamper/ELA claim, since nothing here actually inspects pixel data).
const FRAUD_RULES: {
  match: string;
  okLabel: string;
  failLabel: string;
  failSeverity: FraudSignal["severity"];
}[] = [
  { match: "Amount matches receipt", okLabel: "Amount match", failLabel: "Amount mismatch", failSeverity: "high" },
  { match: "Balance sufficient", okLabel: "Within balance", failLabel: "Over balance", failSeverity: "warn" },
  { match: "OCR confidence", okLabel: "OCR confidence", failLabel: "Low OCR confidence", failSeverity: "warn" },
  {
    match: "Vendor / category sanity",
    okLabel: "Vendor recognised",
    failLabel: "Vendor / category unclear",
    failSeverity: "warn",
  },
];

/** Explainable fraud/anomaly signal list for the Receipt Intelligence screen. */
export function buildFraudSignals(
  checks: VerificationResult["checks"],
  opts: { isDuplicate: boolean; duplicateNote?: string },
): FraudSignal[] {
  const signals: FraudSignal[] = [
    opts.isDuplicate
      ? { label: "Duplicate suspected", detail: opts.duplicateNote ?? "Matches a prior claim.", severity: "high" }
      : { label: "Duplicate check", detail: "No matching prior receipt.", severity: "ok" },
  ];
  for (const rule of FRAUD_RULES) {
    const check = checks.find((c) => c.label === rule.match);
    if (!check) continue;
    signals.push(
      check.ok
        ? { label: rule.okLabel, detail: check.detail, severity: "ok" }
        : { label: rule.failLabel, detail: check.detail, severity: rule.failSeverity },
    );
  }
  return signals;
}

/** Per-field OCR readout for the Receipt Intelligence screen's "extracted fields" panel. */
export function buildOcrFields(extracted: ExtractedReceipt): OcrField[] {
  if (extracted.amountPaise === null && extracted.date === null && extracted.vendor === null) return [];
  return [
    {
      label: "Vendor",
      value: extracted.vendor?.trim() || "—",
      confidencePercent: Math.round(extracted.fieldConfidence.vendor * 100),
    },
    {
      label: "Total amount",
      value: extracted.amountPaise !== null ? formatINR(extracted.amountPaise / 100) : "—",
      confidencePercent: Math.round(extracted.fieldConfidence.amount * 100),
    },
    {
      label: "Expense date",
      value: extracted.date ?? "—",
      confidencePercent: Math.round(extracted.fieldConfidence.date * 100),
    },
  ];
}
// ---- end KAN-111 ----

// Vision model for receipt field extraction — Haiku is fast + cheap for OCR.
const OCR_MODEL = "claude-haiku-4-5-20251001";

// KAN-111: per-field confidence (falls back to the overall `confidence` when
// the model omits it) — powers the "extracted fields" confidence bars on the
// Receipt Intelligence screen.
export type FieldConfidence = { amount: number; date: number; vendor: number };

export type ExtractedReceipt = {
  amountPaise: number | null;
  date: string | null;
  vendor: string | null;
  confidence: number;
  fieldConfidence: FieldConfidence;
};

// Shared "nothing extracted" fallback — used when there's no file, OCR throws,
// or the model's response doesn't parse. Exported so callers (e.g. the submit
// action's pre-OCR default) don't each redeclare the same literal.
export const EMPTY_EXTRACTED_RECEIPT: ExtractedReceipt = {
  amountPaise: null,
  date: null,
  vendor: null,
  confidence: 0,
  fieldConfidence: { amount: 0, date: 0, vendor: 0 },
};

export type ReceiptMediaType = "image/png" | "image/jpeg" | "application/pdf";

const OCR_PROMPT =
  "Extract the receipt's total amount (in paise, integer — multiply rupees by 100), " +
  "the date (ISO YYYY-MM-DD), and the vendor name. Respond ONLY with JSON: " +
  '{"amountPaise":number|null,"date":string|null,"vendor":string|null,"confidence":number,' +
  '"fieldConfidence":{"amount":number,"date":number,"vendor":number}}. ' +
  "confidence is your overall 0..1 certainty the fields are correct; fieldConfidence gives a " +
  "separate 0..1 certainty per field. Use a low value if the document is unreadable.";

function parseExtraction(text: string | undefined): ExtractedReceipt {
  if (!text) return EMPTY_EXTRACTED_RECEIPT;
  try {
    // The model may wrap JSON in prose/markdown — pull the first {...} block.
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as Partial<ExtractedReceipt>;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const fc = parsed.fieldConfidence;
    return {
      amountPaise: typeof parsed.amountPaise === "number" ? parsed.amountPaise : null,
      date: typeof parsed.date === "string" ? parsed.date : null,
      vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
      confidence,
      fieldConfidence: {
        amount: typeof fc?.amount === "number" ? fc.amount : confidence,
        date: typeof fc?.date === "number" ? fc.date : confidence,
        vendor: typeof fc?.vendor === "number" ? fc.vendor : confidence,
      },
    };
  } catch {
    return EMPTY_EXTRACTED_RECEIPT;
  }
}

/**
 * Extract amount/date/vendor from a receipt via the Claude API (KAN-42).
 * PDFs are sent as a `document` block, images as an `image` block — the two
 * content shapes differ. Lazily imports the SDK so the module stays cheap to load
 * on the rule-only path.
 */
export async function parseReceiptWithClaude(
  base64: string,
  mediaType: ReceiptMediaType,
): Promise<ExtractedReceipt> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { getEnv } = await import("@/lib/env");
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  // PDF → document block; PNG/JPEG → image block (their source shapes differ).
  const fileBlock =
    mediaType === "application/pdf"
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: mediaType, data: base64 },
        };

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: OCR_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: OCR_PROMPT }],
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text");
  return parseExtraction(text && text.type === "text" ? text.text : undefined);
}
