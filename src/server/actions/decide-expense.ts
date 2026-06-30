"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitCategories, benefitClaims, emailLog, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { sendEmail } from "@/server/email";
import { formatINR } from "@/lib/format";

const schema = z.object({
  claimId: z.string().uuid("Invalid claim."),
  approve: z.boolean(),
  reason: z.string().optional(),
});

export type DecisionResult = { ok: boolean; message: string };

/**
 * HR Head decides an expense claim that failed automated verification.
 * Enforces capability (only hr_head/admin approve expenses), advances the claim,
 * records the approver + decision reason, writes an audit row, and best-effort
 * notifies the employee. Balance is derived from claim status (pending reserves,
 * approved consumes, rejected releases), so no separate balance row is mutated.
 */
export async function decideExpenseAction(input: z.input<typeof schema>): Promise<DecisionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { claimId, approve, reason } = parsed.data;

  // A rejection must carry a reason the employee will see.
  if (!approve && !reason?.trim()) return { ok: false, message: "Add a reason for the rejection." };

  const me = await requireUser();
  try {
    assertCan(me.role, "approveExpense");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: benefitClaims.id,
      status: benefitClaims.status,
      amountPaise: benefitClaims.amountPaise,
      applicantName: users.name,
      applicantEmail: users.email,
      category: benefitCategories.name,
    })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(eq(benefitClaims.id, claimId))
    .limit(1);

  if (!row) return { ok: false, message: "Claim not found." };
  if (row.status !== "pending_hr") return { ok: false, message: "This claim is no longer pending." };

  const status = approve ? "approved" : "rejected";

  await db.transaction(async (tx) => {
    await tx
      .update(benefitClaims)
      .set({ status, approverId: me.id, decisionReason: reason?.trim() || null })
      .where(eq(benefitClaims.id, claimId));

    await tx.insert(auditLog).values({
      actorId: me.id,
      action: `${status}_expense`,
      entity: "benefit_claim",
      entityId: claimId,
      payload: { status, amountPaise: row.amountPaise, category: row.category, reason: reason?.trim() ?? null },
    });
  });

  // Best-effort notification — always record the attempt in the email log.
  const amount = formatINR(row.amountPaise / 100);
  const subject = approve
    ? `Your ${row.category} expense of ${amount} was approved`
    : `Your ${row.category} expense of ${amount} was rejected`;
  const html = approve
    ? `<p>Hi ${row.applicantName},</p><p>Your ${row.category} expense claim for ${amount} has been approved by HR and will be reimbursed at financial year-end.</p>`
    : `<p>Hi ${row.applicantName},</p><p>Your ${row.category} expense claim for ${amount} was rejected.</p><p>Reason: ${reason?.trim()}</p>`;
  try {
    await sendEmail({ to: row.applicantEmail, subject, html });
    await db.insert(emailLog).values({ toAddress: row.applicantEmail, subject, template: "expense_decision", status: "sent" });
  } catch {
    await db
      .insert(emailLog)
      .values({ toAddress: row.applicantEmail, subject, template: "expense_decision", status: "failed" })
      .catch(() => {});
  }

  for (const path of ["/expenses", "/dashboard", "/submit"]) revalidatePath(path);

  return {
    ok: true,
    message: approve ? `Approved ${amount} — employee notified` : "Claim rejected — balance released, employee notified",
  };
}
