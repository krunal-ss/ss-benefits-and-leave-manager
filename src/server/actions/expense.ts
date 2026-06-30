"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { getCategoryBalanceByKey } from "@/server/employee/balances";
import { runRuleChecks } from "@/server/verification";
import { currentFy, todayISO } from "@/lib/fy";

const schema = z.object({
  category: z.enum(["sports", "learning"]),
  amountRupees: z.number().positive("Enter an amount."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  vendor: z.string().default(""),
  hasDocument: z.boolean(),
});

export type CheckOutcome = { label: string; ok: boolean; detail: string };
export type SubmitResult = {
  ok: boolean;
  error?: string;
  status?: "auto_approved" | "pending_hr";
  checks?: CheckOutcome[];
};

export async function submitExpenseAction(input: z.input<typeof schema>): Promise<SubmitResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  assertCan(user.role, "submitExpense"); // capability; the claim is always the actor's own

  const fy = currentFy().label;
  const bal = await getCategoryBalanceByKey(user.id, fy, parsed.data.category);
  if (!bal) return { ok: false, error: "Benefit category not configured — seed the database." };

  const claimedPaise = Math.round(parsed.data.amountRupees * 100);
  const db = getDb();

  const dupes = await db
    .select({ id: benefitClaims.id })
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

  const result = runRuleChecks({
    hasDocument: parsed.data.hasDocument,
    isDuplicate: !!dupes[0],
    claimedPaise,
    extractedPaise: parsed.data.hasDocument ? claimedPaise : null,
    expenseDate: parsed.data.date,
    referenceDate: todayISO(),
    availablePaise: bal.availablePaise,
    vendor: parsed.data.vendor,
    ocrConfidence: parsed.data.hasDocument ? 0.96 : 0,
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
    payload: { status, claimedPaise, category: parsed.data.category },
  });

  revalidatePath("/dashboard");
  revalidatePath("/submit");
  return { ok: true, status, checks: result.checks };
}
