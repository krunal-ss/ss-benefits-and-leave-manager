"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { getCategoryBalanceByKey } from "@/server/employee/balances";
import {
  parseReceiptWithClaude,
  runRuleChecks,
  type ExtractedReceipt,
  type ReceiptMediaType,
} from "@/server/verification";
import { isAllowedReceiptType, uploadReceipt } from "@/server/supabase/storage";
import { currentFy, todayISO } from "@/lib/fy";

const schema = z.object({
  category: z.enum(["sports", "learning"]),
  amountRupees: z.number().positive("Enter an amount."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  vendor: z.string().default(""),
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
  if (hasFile && !isAllowedReceiptType(file.type)) {
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
  let extracted: ExtractedReceipt = { amountPaise: null, date: null, vendor: null, confidence: 0 };
  if (hasFile) {
    try {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      extracted = await parseReceiptWithClaude(base64, file.type as ReceiptMediaType);
    } catch {
      extracted = { amountPaise: null, date: null, vendor: null, confidence: 0 };
    }
  }

  // PRD §4.5 AC2: a claim duplicates a prior one if the document hash matches, OR
  // (legacy/no-file path) the same category + amount + expense date already exist.
  const dupeConds = [
    and(
      eq(benefitClaims.userId, user.id),
      eq(benefitClaims.categoryId, bal.categoryId),
      eq(benefitClaims.amountPaise, claimedPaise),
      eq(benefitClaims.expenseDate, parsed.data.date),
    ),
  ];
  if (documentHash) {
    dupeConds.push(
      and(eq(benefitClaims.userId, user.id), eq(benefitClaims.documentHash, documentHash)),
    );
  }
  const dupes = await db
    .select({ id: benefitClaims.id })
    .from(benefitClaims)
    .where(or(...dupeConds))
    .limit(1);

  // Prefer the OCR'd vendor when extraction is confident; otherwise the typed one.
  const vendorForCheck = extracted.vendor?.trim() ? extracted.vendor : parsed.data.vendor;

  const result = runRuleChecks({
    hasDocument: hasFile,
    isDuplicate: !!dupes[0],
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

  revalidatePath("/dashboard");
  revalidatePath("/submit");
  return { ok: true, status, checks: result.checks };
}
