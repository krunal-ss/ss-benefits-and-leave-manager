import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitClaims } from "@/db/schema";
import {
  buildFraudSignals,
  buildOcrFields,
  computeAiScore,
  EMPTY_EXTRACTED_RECEIPT,
  parseReceiptWithClaude,
  runRuleChecks,
  type ExtractedReceipt,
} from "@/server/verification";
import { isAllowedReceiptType, uploadReceipt } from "@/server/supabase/storage";
import { todayISO } from "@/lib/fy";
import { formatINR } from "@/lib/format";

type Db = ReturnType<typeof getDb>;

export type CheckOutcome = { label: string; ok: boolean; detail: string };

export type VerifyClaimInput = {
  db: Db;
  userId: string;
  categoryId: string;
  claimedPaise: number;
  expenseDate: string;
  vendor: string;
  availablePaise: number;
  /** A freshly-attached file for this request, or null when none was re-attached. */
  file: File | null;
  /** Reused when `file` is null — e.g. resuming a draft that already has a stored receipt. */
  existingDocumentUrl: string | null;
  existingDocumentHash: string | null;
  /** Exclude this claim's own id from the duplicate lookup (resubmission/draft update). */
  excludeClaimId?: string;
};

export type VerifyClaimResult =
  | { ok: false; error: string }
  | {
      ok: true;
      documentUrl: string | null;
      documentHash: string | null;
      status: "auto_approved" | "pending_hr";
      checks: CheckOutcome[];
      verificationResult: ReturnType<typeof runRuleChecks>;
      receiptVerification: {
        aiScore: number;
        verdict: ReturnType<typeof computeAiScore>["verdict"];
        verdictReason: string;
        factors: ReturnType<typeof computeAiScore>["factors"];
        fraudSignals: ReturnType<typeof buildFraudSignals>;
        duplicateMatch: { claimId: string; similarityPercent: number; note: string } | null;
        ocrFields: ReturnType<typeof buildOcrFields>;
      };
    };

/**
 * The shared verification pipeline behind both a fresh submit (`expense.ts`) and
 * finalizing a draft/resubmission: store the receipt (if a new one was attached),
 * OCR it, run the pure rule engine, check for duplicates, and compute the
 * explainable AI score. Callers own writing the `benefitClaims` row itself
 * (insert vs. update differ) and the audit-log entries.
 *
 * When no new file is attached and there's no existing stored receipt either,
 * this fails closed (hard rule: never auto-approve without a document). When
 * resuming a stored receipt with no new file, OCR degrades to a zero-confidence
 * extraction (we don't have raw bytes to re-parse) — which fails the OCR check
 * and routes to HR, never silently auto-approving.
 */
export async function verifyAndScoreClaim(input: VerifyClaimInput): Promise<VerifyClaimResult> {
  const { db, userId, categoryId, claimedPaise, expenseDate, vendor, availablePaise, file, excludeClaimId } = input;
  const hasNewFile = file instanceof File && file.size > 0;
  let documentUrl = input.existingDocumentUrl;
  let documentHash = input.existingDocumentHash;
  let extracted: ExtractedReceipt = EMPTY_EXTRACTED_RECEIPT;

  if (hasNewFile) {
    if (!isAllowedReceiptType(file.type)) {
      return { ok: false, error: "Unsupported file type — upload a PDF, JPG, or PNG." };
    }
    try {
      const stored = await uploadReceipt(file, userId);
      documentUrl = stored.path;
      documentHash = stored.hash;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not store the receipt." };
    }
    try {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      extracted = await parseReceiptWithClaude(base64, file.type);
    } catch {
      extracted = EMPTY_EXTRACTED_RECEIPT;
    }
  }
  if (!documentUrl) {
    return { ok: false, error: "A supporting document is required." };
  }

  const dupeSelection = {
    id: benefitClaims.id,
    vendor: benefitClaims.vendor,
    amountPaise: benefitClaims.amountPaise,
    expenseDate: benefitClaims.expenseDate,
  };
  let duplicateMatch:
    | { id: string; vendor: string | null; amountPaise: number | null; expenseDate: string | null; similarityPercent: number }
    | null = null;
  if (documentHash) {
    const [hashMatch] = await db
      .select(dupeSelection)
      .from(benefitClaims)
      .where(and(eq(benefitClaims.userId, userId), eq(benefitClaims.documentHash, documentHash)))
      .limit(1);
    if (hashMatch && hashMatch.id !== excludeClaimId) duplicateMatch = { ...hashMatch, similarityPercent: 100 };
  }
  if (!duplicateMatch) {
    const [heuristicMatch] = await db
      .select(dupeSelection)
      .from(benefitClaims)
      .where(
        and(
          eq(benefitClaims.userId, userId),
          eq(benefitClaims.categoryId, categoryId),
          eq(benefitClaims.amountPaise, claimedPaise),
          eq(benefitClaims.expenseDate, expenseDate),
        ),
      )
      .limit(1);
    if (heuristicMatch && heuristicMatch.id !== excludeClaimId)
      duplicateMatch = { ...heuristicMatch, similarityPercent: 85 };
  }
  const isDuplicate = !!duplicateMatch;
  const duplicateNote = duplicateMatch
    ? `Matches claim ${duplicateMatch.id.slice(0, 8)} — ${formatINR((duplicateMatch.amountPaise ?? 0) / 100)} on ${duplicateMatch.expenseDate ?? "—"}${duplicateMatch.vendor ? ` (${duplicateMatch.vendor})` : ""}.`
    : undefined;

  const vendorForCheck = extracted.vendor?.trim() ? extracted.vendor : vendor;

  const result = runRuleChecks({
    hasDocument: true,
    isDuplicate,
    claimedPaise,
    extractedPaise: extracted.amountPaise,
    expenseDate,
    referenceDate: todayISO(),
    availablePaise,
    vendor: vendorForCheck,
    ocrConfidence: extracted.confidence,
    extracted: hasNewFile
      ? { amountPaise: extracted.amountPaise, date: extracted.date, vendor: extracted.vendor }
      : undefined,
  });

  const status = result.passed ? "auto_approved" : "pending_hr";

  const aiScore = computeAiScore(result.checks, { isDuplicate });
  const fraudSignals = buildFraudSignals(result.checks, { isDuplicate, duplicateNote });
  const verdictReason = result.passed
    ? "All verification checks passed."
    : `Flagged by: ${result.checks.filter((c) => !c.ok).map((c) => c.label).join(", ")}.`;

  return {
    ok: true,
    documentUrl,
    documentHash,
    status,
    checks: result.checks,
    verificationResult: result,
    receiptVerification: {
      aiScore: aiScore.score,
      verdict: aiScore.verdict,
      verdictReason,
      factors: aiScore.factors,
      fraudSignals,
      duplicateMatch: duplicateMatch
        ? { claimId: duplicateMatch.id, similarityPercent: duplicateMatch.similarityPercent, note: duplicateNote! }
        : null,
      ocrFields: buildOcrFields(extracted),
    },
  };
}
