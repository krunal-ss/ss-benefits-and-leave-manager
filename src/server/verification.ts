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

  return { passed: checks.every((c) => c.ok), checks, ocrConfidence: input.ocrConfidence };
}

// Vision model for receipt field extraction — Haiku is fast + cheap for OCR.
const OCR_MODEL = "claude-haiku-4-5-20251001";

export type ExtractedReceipt = {
  amountPaise: number | null;
  date: string | null;
  vendor: string | null;
  confidence: number;
};

/**
 * Extract amount/date/vendor from a receipt image via the Claude API.
 * Lazily imports the SDK so the module stays cheap to load on the rule-only path.
 */
export async function parseReceiptWithClaude(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg" | "application/pdf",
): Promise<ExtractedReceipt> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { getEnv } = await import("@/lib/env");
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: OCR_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/png", data: imageBase64 },
          },
          {
            type: "text",
            text:
              "Extract the receipt's total amount (in paise, integer), the date (ISO YYYY-MM-DD), " +
              "and the vendor name. Respond ONLY with JSON: " +
              '{"amountPaise":number|null,"date":string|null,"vendor":string|null,"confidence":number}.',
          },
        ],
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return { amountPaise: null, date: null, vendor: null, confidence: 0 };
  try {
    return JSON.parse(text.text) as ExtractedReceipt;
  } catch {
    return { amountPaise: null, date: null, vendor: null, confidence: 0 };
  }
}
