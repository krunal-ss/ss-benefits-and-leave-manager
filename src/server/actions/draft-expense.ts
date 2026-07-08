"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims, receiptVerifications } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { getCategoryBalanceByKey } from "@/server/employee/balances";
import { isAllowedReceiptType, uploadReceipt } from "@/server/supabase/storage";
import { verifyAndScoreClaim } from "@/server/expense-pipeline";
import { currentFy } from "@/lib/fy";
import { formString } from "@/lib/form-data";
import type { SubmitResult } from "@/server/actions/expense";

// KAN-125 — Expense Draft Save. A draft is a `benefitClaims` row with
// status = "draft": it may have some/all of category, amount, date, vendor,
// and receipt unset, and it never reserves category balance (getCategoryBalances
// only counts APPROVED/PENDING statuses, see src/server/employee/balances.ts).

const draftFieldsSchema = z.object({
  draftId: z.string().uuid().optional(),
  category: z.enum(["sports", "learning"]).optional(),
  amountRupees: z.number().optional(),
  date: z.string().optional(),
  vendor: z.string().optional(),
});

export type SaveDraftResult = { ok: boolean; error?: string; draftId?: string };

function readDraftFormData(formData: FormData) {
  const draftId = formString(formData, "draftId") || undefined;
  const amountRaw = formData.get("amountRupees");
  const amountRupees =
    amountRaw !== null && amountRaw !== "" && !Number.isNaN(Number(amountRaw)) ? Number(amountRaw) : undefined;
  return draftFieldsSchema.parse({
    draftId,
    category: formString(formData, "category") || undefined,
    amountRupees,
    date: formString(formData, "date") || undefined,
    vendor: formString(formData, "vendor") || undefined,
  });
}

/** Create a new draft, or update an existing one owned by the caller (used for both "Save draft" and autosave). */
export async function saveDraftAction(formData: FormData): Promise<SaveDraftResult> {
  let parsed: z.infer<typeof draftFieldsSchema>;
  try {
    parsed = readDraftFormData(formData);
  } catch {
    return { ok: false, error: "Could not read the draft." };
  }

  const user = await requireUser();
  assertCan(user.role, "submitExpense"); // a draft is always the actor's own
  const db = getDb();
  const fy = currentFy().label;

  let categoryId: string | null = null;
  if (parsed.category) {
    const bal = await getCategoryBalanceByKey(user.id, fy, parsed.category);
    if (!bal) return { ok: false, error: "Benefit category not configured — seed the database." };
    categoryId = bal.categoryId;
  }
  const amountPaise = parsed.amountRupees && parsed.amountRupees > 0 ? Math.round(parsed.amountRupees * 100) : null;

  const file = formData.get("receipt");
  const hasNewFile = file instanceof File && file.size > 0;
  let documentUrl: string | null = null;
  let documentHash: string | null = null;
  if (hasNewFile) {
    if (!isAllowedReceiptType(file.type)) {
      return { ok: false, error: "Unsupported file type — upload a PDF, JPG, or PNG." };
    }
    try {
      const stored = await uploadReceipt(file, user.id);
      documentUrl = stored.path;
      documentHash = stored.hash;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not store the receipt." };
    }
  }

  if (parsed.draftId) {
    const [existing] = await db
      .select({ id: benefitClaims.id, status: benefitClaims.status, documentUrl: benefitClaims.documentUrl, documentHash: benefitClaims.documentHash })
      .from(benefitClaims)
      .where(and(eq(benefitClaims.id, parsed.draftId), eq(benefitClaims.userId, user.id)))
      .limit(1);
    if (!existing) return { ok: false, error: "Draft not found." };
    if (existing.status !== "draft") return { ok: false, error: "This claim is no longer a draft." };

    await db
      .update(benefitClaims)
      .set({
        categoryId,
        amountPaise,
        expenseDate: parsed.date || null,
        vendor: parsed.vendor || null,
        documentUrl: hasNewFile ? documentUrl : existing.documentUrl,
        documentHash: hasNewFile ? documentHash : existing.documentHash,
      })
      .where(eq(benefitClaims.id, existing.id));

    await db.insert(auditLog).values({
      actorId: user.id,
      action: "update_draft",
      entity: "benefit_claim",
      entityId: existing.id,
      payload: { category: parsed.category, amountPaise, hasDocument: hasNewFile || !!existing.documentUrl },
    });

    revalidatePath("/submit");
    return { ok: true, draftId: existing.id };
  }

  const [created] = await db
    .insert(benefitClaims)
    .values({
      userId: user.id,
      categoryId,
      amountPaise,
      expenseDate: parsed.date || null,
      vendor: parsed.vendor || null,
      documentUrl,
      documentHash,
      status: "draft",
      fy,
    })
    .returning({ id: benefitClaims.id });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "save_draft",
    entity: "benefit_claim",
    entityId: created.id,
    payload: { category: parsed.category, amountPaise, hasDocument: hasNewFile },
  });

  revalidatePath("/submit");
  return { ok: true, draftId: created.id };
}

const deleteDraftSchema = z.object({ draftId: z.string().uuid("Invalid draft.") });

export type DeleteDraftResult = { ok: boolean; error?: string };

/** Ownership + status-guarded delete, mirroring delete-claim.ts's shape for pending_hr claims. */
export async function deleteDraftAction(input: z.input<typeof deleteDraftSchema>): Promise<DeleteDraftResult> {
  const parsed = deleteDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  const db = getDb();

  const [draft] = await db
    .select({ id: benefitClaims.id, status: benefitClaims.status })
    .from(benefitClaims)
    .where(and(eq(benefitClaims.id, parsed.data.draftId), eq(benefitClaims.userId, user.id)))
    .limit(1);

  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status !== "draft") return { ok: false, error: "Only a draft can be deleted this way." };

  await db.delete(benefitClaims).where(eq(benefitClaims.id, draft.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "delete_draft",
    entity: "benefit_claim",
    entityId: draft.id,
    payload: {},
  });

  revalidatePath("/submit");
  return { ok: true };
}

const submitSchema = z.object({
  draftId: z.string().uuid("Invalid draft."),
  category: z.enum(["sports", "learning"]),
  amountRupees: z.number().positive("Enter an amount."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  vendor: z.string().trim().min(1, "Description is required."),
});

/**
 * Finalize a draft: validate every required field is now present, run it
 * through the same verification pipeline as a fresh submit, and flip its
 * status to auto_approved/pending_hr — never leaving it as a draft.
 */
export async function submitDraftAction(formData: FormData): Promise<SubmitResult> {
  const raw = {
    draftId: formData.get("draftId"),
    category: formData.get("category"),
    amountRupees: Number(formData.get("amountRupees")),
    date: formData.get("date"),
    vendor: formString(formData, "vendor") ?? "",
  };
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  assertCan(user.role, "submitExpense");
  const db = getDb();

  const [draft] = await db
    .select({
      id: benefitClaims.id,
      status: benefitClaims.status,
      documentUrl: benefitClaims.documentUrl,
      documentHash: benefitClaims.documentHash,
    })
    .from(benefitClaims)
    .where(and(eq(benefitClaims.id, parsed.data.draftId), eq(benefitClaims.userId, user.id)))
    .limit(1);
  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status !== "draft") return { ok: false, error: "This claim is no longer a draft." };

  const fy = currentFy().label;
  const bal = await getCategoryBalanceByKey(user.id, fy, parsed.data.category);
  if (!bal) return { ok: false, error: "Benefit category not configured — seed the database." };

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
    existingDocumentUrl: draft.documentUrl,
    existingDocumentHash: draft.documentHash,
    excludeClaimId: draft.id, // don't flag the draft as a duplicate of itself
  });
  if (!verified.ok) return { ok: false, error: verified.error };

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
      fy,
    })
    .where(eq(benefitClaims.id, draft.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "submit_expense",
    entity: "benefit_claim",
    entityId: draft.id,
    payload: { status: verified.status, claimedPaise, category: parsed.data.category, fromDraft: true },
  });

  await db.insert(receiptVerifications).values({ claimId: draft.id, ...verified.receiptVerification });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "receipt_ai_verified",
    entity: "benefit_claim",
    entityId: draft.id,
    payload: { aiScore: verified.receiptVerification.aiScore, verdict: verified.receiptVerification.verdict },
  });

  revalidatePath("/dashboard");
  revalidatePath("/submit");
  return { ok: true, status: verified.status, checks: verified.checks };
}
