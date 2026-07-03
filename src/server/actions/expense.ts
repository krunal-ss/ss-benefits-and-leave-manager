"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims, receiptVerifications } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { getCategoryBalanceByKey } from "@/server/employee/balances";
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
import { currentFy, todayISO } from "@/lib/fy";
import { formatINR } from "@/lib/format";

const schema = z.object({
  category: z.enum(["sports", "learning"]),
  amountRupees: z.number().positive("Enter an amount."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  vendor: z.string().trim().min(1, "Description is required."),
});

export type CheckOutcome = { label: string; ok: boolean; detail: string };
export type SubmitResult = {
  ok: boolean;
  error?: string;
  status?: "auto_approved" | "pending_hr";
  checks?: CheckOutcome[];
};

/**
 * Submit a benefit expense claim with a real uploaded receipt (KAN-41 + KAN-42).
 * Accepts FormData so the receipt File survives the server-action boundary.
 * Flow: validate → store receipt (private bucket, signed-URL only) → OCR via Claude
 * → run the pure rule engine on the *extracted* fields → auto-approve only if every
 * rule passes, otherwise route to HR (never auto-approve an inconclusive claim).
 */
export async function submitExpenseAction(formData: FormData): Promise<SubmitResult> {
  const raw = {
    category: formData.get("category"),
    amountRupees: Number(formData.get("amountRupees")),
    date: formData.get("date"),
    vendor: (formData.get("vendor") as string | null) ?? "",
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const file = formData.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile) {
    return { ok: false, error: "A supporting document is required." };
  }
  if (!isAllowedReceiptType(file.type)) {
    return { ok: false, error: "Unsupported file type — upload a PDF, JPG, or PNG." };
  }

  const user = await requireUser();
  assertCan(user.role, "submitExpense"); // capability; the claim is always the actor's own

  const fy = currentFy().label;
  const bal = await getCategoryBalanceByKey(user.id, fy, parsed.data.category);
  if (!bal) return { ok: false, error: "Benefit category not configured — seed the database." };

  const claimedPaise = Math.round(parsed.data.amountRupees * 100);
  const db = getDb();

  // KAN-41: store the receipt in the private bucket + compute its content hash.
  let documentUrl: string | null = null;
  let documentHash: string | null = null;
  if (hasFile) {
    try {
      const stored = await uploadReceipt(file, user.id);
      documentUrl = stored.path;
      documentHash = stored.hash;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not store the receipt." };
    }
  }

  // KAN-42: run real OCR on the uploaded file. Failure (or no key) degrades to a
  // zero-confidence extraction, which fails the OCR rule → routes to HR (never
  // silently auto-approved).
  let extracted: ExtractedReceipt = EMPTY_EXTRACTED_RECEIPT;
  if (hasFile) {
    try {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      extracted = await parseReceiptWithClaude(base64, file.type);
    } catch {
      extracted = EMPTY_EXTRACTED_RECEIPT;
    }
  }

  // PRD §4.5 AC2: a claim duplicates a prior one if the document hash matches, OR
  // (legacy/no-file path) the same category + amount + expense date already exist.
  // Queried separately (rather than one OR) so we know *which* match fired —
  // KAN-111 needs that to show a real duplicate-match card + similarity, not just
  // a boolean. A hash match is a stronger signal than the amount/date heuristic.
  const dupeSelection = {
    id: benefitClaims.id,
    vendor: benefitClaims.vendor,
    amountPaise: benefitClaims.amountPaise,
    expenseDate: benefitClaims.expenseDate,
  };
  let duplicateMatch:
    | { id: string; vendor: string | null; amountPaise: number; expenseDate: string; similarityPercent: number }
    | null = null;
  if (documentHash) {
    const [hashMatch] = await db
      .select(dupeSelection)
      .from(benefitClaims)
      .where(and(eq(benefitClaims.userId, user.id), eq(benefitClaims.documentHash, documentHash)))
      .limit(1);
    if (hashMatch) duplicateMatch = { ...hashMatch, similarityPercent: 100 };
  }
  if (!duplicateMatch) {
    const [heuristicMatch] = await db
      .select(dupeSelection)
      .from(benefitClaims)
      .where(
        and(
          eq(benefitClaims.userId, user.id),
          eq(benefitClaims.categoryId, bal.categoryId),
          eq(benefitClaims.amountPaise, claimedPaise),
          eq(benefitClaims.expenseDate, parsed.data.date),
        ),
      )
      .limit(1);
    if (heuristicMatch) duplicateMatch = { ...heuristicMatch, similarityPercent: 85 };
  }
  const isDuplicate = !!duplicateMatch;
  const duplicateNote = duplicateMatch
    ? `Matches claim ${duplicateMatch.id.slice(0, 8)} — ${formatINR(duplicateMatch.amountPaise / 100)} on ${duplicateMatch.expenseDate}${duplicateMatch.vendor ? ` (${duplicateMatch.vendor})` : ""}.`
    : undefined;

  // Prefer the OCR'd vendor when extraction is confident; otherwise the typed one.
  const vendorForCheck = extracted.vendor?.trim() ? extracted.vendor : parsed.data.vendor;

  const result = runRuleChecks({
    hasDocument: hasFile,
    isDuplicate,
    claimedPaise,
    extractedPaise: extracted.amountPaise,
    expenseDate: parsed.data.date,
    referenceDate: todayISO(),
    availablePaise: bal.availablePaise,
    vendor: vendorForCheck,
    ocrConfidence: extracted.confidence,
    extracted: hasFile
      ? { amountPaise: extracted.amountPaise, date: extracted.date, vendor: extracted.vendor }
      : undefined,
  });

  // Hard rule: never auto-approve an inconclusive claim — route to HR.
  const status = result.passed ? "auto_approved" : "pending_hr";

  const [claim] = await db
    .insert(benefitClaims)
    .values({
      userId: user.id,
      categoryId: bal.categoryId,
      amountPaise: claimedPaise,
      expenseDate: parsed.data.date,
      vendor: parsed.data.vendor || null,
      documentUrl,
      documentHash,
      status,
      verificationResult: result,
      fy,
    })
    .returning({ id: benefitClaims.id });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "submit_expense",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: { status, claimedPaise, category: parsed.data.category, hasDocument: hasFile },
  });

  // KAN-111/115: explainable AI score + fraud signals, additive to the pass/fail
  // rule outcome above — informs HR's manual review, never gates auto-approval.
  const aiScore = computeAiScore(result.checks, { isDuplicate });
  const fraudSignals = buildFraudSignals(result.checks, { isDuplicate, duplicateNote });
  const verdictReason = result.passed
    ? "All verification checks passed."
    : `Flagged by: ${result.checks.filter((c) => !c.ok).map((c) => c.label).join(", ")}.`;

  await db.insert(receiptVerifications).values({
    claimId: claim.id,
    aiScore: aiScore.score,
    verdict: aiScore.verdict,
    verdictReason,
    factors: aiScore.factors,
    fraudSignals,
    duplicateMatch: duplicateMatch
      ? { claimId: duplicateMatch.id, similarityPercent: duplicateMatch.similarityPercent, note: duplicateNote! }
      : null,
    ocrFields: buildOcrFields(extracted),
  });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "receipt_ai_verified",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: { aiScore: aiScore.score, verdict: aiScore.verdict },
  });

  revalidatePath("/dashboard");
  revalidatePath("/submit");
  return { ok: true, status, checks: result.checks };
}
