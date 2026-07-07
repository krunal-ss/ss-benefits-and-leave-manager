"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaimVersions, benefitClaims, receiptVerifications } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { getCategoryBalanceByKey } from "@/server/employee/balances";
import { verifyAndScoreClaim } from "@/server/expense-pipeline";
import { currentFy } from "@/lib/fy";
import { formString } from "@/lib/form-data";
import type { SubmitResult } from "@/server/actions/expense";

// KAN-126 — Claim Resubmission. A `rejected` claim is edited and resubmitted
// under the SAME claim id (no new row): the pre-edit state is snapshotted to
// `benefit_claim_versions` first, then the row is updated and re-run through
// the same verification pipeline as a fresh submit (AC1-AC3).

const resubmitSchema = z.object({
  claimId: z.string().uuid("Invalid claim."),
  category: z.enum(["sports", "learning"]),
  amountRupees: z.number().positive("Enter an amount."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  vendor: z.string().trim().min(1, "Description is required."),
});

/** Finalize an edit to a `rejected` claim: snapshot the old version, apply the edit, and re-verify. */
export async function resubmitClaimAction(formData: FormData): Promise<SubmitResult> {
  const raw = {
    claimId: formData.get("claimId"),
    category: formData.get("category"),
    amountRupees: Number(formData.get("amountRupees")),
    date: formData.get("date"),
    vendor: formString(formData, "vendor") ?? "",
  };
  const parsed = resubmitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  assertCan(user.role, "submitExpense"); // a resubmission is always the actor's own
  const db = getDb();

  const [claim] = await db
    .select({
      id: benefitClaims.id,
      status: benefitClaims.status,
      categoryId: benefitClaims.categoryId,
      amountPaise: benefitClaims.amountPaise,
      expenseDate: benefitClaims.expenseDate,
      vendor: benefitClaims.vendor,
      documentUrl: benefitClaims.documentUrl,
      documentHash: benefitClaims.documentHash,
      decisionReason: benefitClaims.decisionReason,
    })
    .from(benefitClaims)
    .where(and(eq(benefitClaims.id, parsed.data.claimId), eq(benefitClaims.userId, user.id)))
    .limit(1);
  if (!claim) return { ok: false, error: "Claim not found." };
  if (claim.status !== "rejected") return { ok: false, error: "Only a rejected claim can be resubmitted." };

  const fy = currentFy().label;
  const bal = await getCategoryBalanceByKey(user.id, fy, parsed.data.category);
  if (!bal) return { ok: false, error: "Benefit category not configured — seed the database." };

  const [{ value: priorVersionCount }] = await db
    .select({ value: count() })
    .from(benefitClaimVersions)
    .where(eq(benefitClaimVersions.claimId, claim.id));

  const claimedPaise = Math.round(parsed.data.amountRupees * 100);
  const file = formData.get("receipt");

  const verified = await verifyAndScoreClaim({
    db,
    userId: user.id,
    categoryId: bal.categoryId,
    claimedPaise,
    expenseDate: parsed.data.date,
    vendor: parsed.data.vendor,
    availablePaise: bal.availablePaise,
    file: file instanceof File ? file : null,
    existingDocumentUrl: claim.documentUrl,
    existingDocumentHash: claim.documentHash,
    excludeClaimId: claim.id, // don't flag the claim's own prior receipt as a duplicate of itself
  });
  if (!verified.ok) return { ok: false, error: verified.error };

  // Snapshot the PRE-EDIT (rejected) state before applying the edit (AC2).
  await db.insert(benefitClaimVersions).values({
    claimId: claim.id,
    versionNumber: priorVersionCount + 1,
    amountPaise: claim.amountPaise,
    categoryId: claim.categoryId,
    expenseDate: claim.expenseDate,
    vendor: claim.vendor,
    documentUrl: claim.documentUrl,
    documentHash: claim.documentHash,
    status: claim.status,
    decisionReason: claim.decisionReason,
  });

  await db
    .update(benefitClaims)
    .set({
      categoryId: bal.categoryId,
      amountPaise: claimedPaise,
      expenseDate: parsed.data.date,
      vendor: parsed.data.vendor || null,
      documentUrl: verified.documentUrl,
      documentHash: verified.documentHash,
      status: verified.status,
      verificationResult: verified.verificationResult,
      approverId: null,
      decisionReason: null,
      fy,
    })
    .where(eq(benefitClaims.id, claim.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "resubmit_expense",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: {
      status: verified.status,
      claimedPaise,
      category: parsed.data.category,
      versionNumber: priorVersionCount + 2, // the version this resubmission becomes
    },
  });

  // A rejected claim already has a receiptVerifications row from its original
  // submission (claimId is unique there) — update it in place rather than insert.
  await db
    .update(receiptVerifications)
    .set(verified.receiptVerification)
    .where(eq(receiptVerifications.claimId, claim.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "receipt_ai_verified",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: { aiScore: verified.receiptVerification.aiScore, verdict: verified.receiptVerification.verdict },
  });

  revalidatePath("/dashboard");
  revalidatePath("/submit");
  revalidatePath("/expenses");
  return { ok: true, status: verified.status, checks: verified.checks };
}
