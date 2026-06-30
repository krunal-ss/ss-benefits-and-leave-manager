// PRD §4.3 — automated expense verification. The rule engine is pure +
// explainable (never a black box): it returns every rule outcome for audit.
// An optional Claude vision pass extracts amount/date/vendor from the receipt.

import type { VerificationResult } from "@/db/schema";
import { fyBounds } from "@/lib/fy";

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

// Vision model for receipt field extraction — Haiku is fast + cheap for OCR.
const OCR_MODEL = "claude-haiku-4-5-20251001";

export type ExtractedReceipt = {
  amountPaise: number | null;
  date: string | null;
  vendor: string | null;
  confidence: number;
};

export type ReceiptMediaType = "image/png" | "image/jpeg" | "application/pdf";

const OCR_PROMPT =
  "Extract the receipt's total amount (in paise, integer — multiply rupees by 100), " +
  "the date (ISO YYYY-MM-DD), and the vendor name. Respond ONLY with JSON: " +
  '{"amountPaise":number|null,"date":string|null,"vendor":string|null,"confidence":number}. ' +
  "confidence is your 0..1 certainty the fields are correct; use a low value if the document is unreadable.";

function parseExtraction(text: string | undefined): ExtractedReceipt {
  if (!text) return { amountPaise: null, date: null, vendor: null, confidence: 0 };
  try {
    // The model may wrap JSON in prose/markdown — pull the first {...} block.
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as Partial<ExtractedReceipt>;
    return {
      amountPaise: typeof parsed.amountPaise === "number" ? parsed.amountPaise : null,
      date: typeof parsed.date === "string" ? parsed.date : null,
      vendor: typeof parsed.vendor === "string" ? parsed.vendor : null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return { amountPaise: null, date: null, vendor: null, confidence: 0 };
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
