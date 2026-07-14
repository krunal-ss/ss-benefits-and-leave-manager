"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims, receiptVerifications } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { getCategoryBalanceByKey } from "@/server/employee/balances";
import { isAllowedReceiptType } from "@/server/supabase/storage";
import { verifyAndScoreClaim, type CheckOutcome } from "@/server/expense-pipeline";
import { recordVendorUsage } from "@/server/employee/favorite-vendors";
import { currentFy } from "@/lib/fy";
import { formString } from "@/lib/form-data";

const schema = z.object({
  category: z.enum(["sports", "learning"]),
  amountRupees: z.number().positive("Enter an amount."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  vendor: z.string().trim().min(1, "Description is required."),
});

export type { CheckOutcome };
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
    vendor: formString(formData, "vendor") ?? "",
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

  const verified = await verifyAndScoreClaim({
    db,
    userId: user.id,
    categoryId: bal.categoryId,
    claimedPaise,
    expenseDate: parsed.data.date,
    vendor: parsed.data.vendor,
    availablePaise: bal.availablePaise,
    file,
    existingDocumentUrl: null,
    existingDocumentHash: null,
  });
  if (!verified.ok) return { ok: false, error: verified.error };

  const [claim] = await db
    .insert(benefitClaims)
    .values({
      userId: user.id,
      categoryId: bal.categoryId,
      amountPaise: claimedPaise,
      expenseDate: parsed.data.date,
      vendor: parsed.data.vendor || null,
      documentUrl: verified.documentUrl,
      documentHash: verified.documentHash,
      status: verified.status,
      verificationResult: verified.verificationResult,
      fy,
    })
    .returning({ id: benefitClaims.id });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "submit_expense",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: { status: verified.status, claimedPaise, category: parsed.data.category, hasDocument: hasFile },
  });

  // KAN-111/115: explainable AI score + fraud signals, additive to the pass/fail
  // rule outcome above — informs HR's manual review, never gates auto-approval.
  await db.insert(receiptVerifications).values({ claimId: claim.id, ...verified.receiptVerification });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "receipt_ai_verified",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: { aiScore: verified.receiptVerification.aiScore, verdict: verified.receiptVerification.verdict },
  });

  // KAN-207 — only after the claim itself is persisted, so a favorites-bookkeeping
  // failure can never orphan a receipt upload or block a successful submission.
  await recordVendorUsage(user.id, parsed.data.vendor).catch((err) =>
    console.error("recordVendorUsage failed", err),
  );

  revalidatePath("/dashboard");
  revalidatePath("/submit");
  return { ok: true, status: verified.status, checks: verified.checks };
}
