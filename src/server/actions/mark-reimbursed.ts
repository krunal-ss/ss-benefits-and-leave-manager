"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { PAYABLE_STATUSES } from "@/server/hr/reimbursement";
import { currentFy } from "@/lib/fy";

// KAN-45 — confirm payout. We do NOT disburse money here; we only transition the
// payable claims for a FY to "reimbursed" and write an AuditLog row recording the
// batch (hard rule: a status change to Reimbursed MUST be audited). HR Head-only,
// gated on the runReimbursementExport capability.

const schema = z.object({
  fy: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "FY must look like 2026-27.")
    .optional(),
});

export type MarkReimbursedResult = { ok: boolean; message: string; count?: number; totalPaise?: number };

export async function markReimbursedAction(
  input: z.input<typeof schema>,
): Promise<MarkReimbursedResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const fy = parsed.data.fy ?? currentFy().label;

  const me = await requireUser();
  try {
    assertCan(me.role, "runReimbursementExport");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  const db = getDb();

  // Snapshot which claims are about to be paid out (for the audit payload), then
  // flip them all in one transaction. Only payable statuses are touched, so
  // already-reimbursed/rejected/pending claims are never disturbed.
  const result = await db.transaction(async (tx) => {
    const payable = await tx
      .select({ id: benefitClaims.id, userId: benefitClaims.userId, amountPaise: benefitClaims.amountPaise })
      .from(benefitClaims)
      .where(and(eq(benefitClaims.fy, fy), inArray(benefitClaims.status, [...PAYABLE_STATUSES])));

    if (payable.length === 0) return { count: 0, totalPaise: 0 };

    const ids = payable.map((c) => c.id);
    const totalPaise = payable.reduce((s, c) => s + c.amountPaise, 0);

    await tx
      .update(benefitClaims)
      .set({ status: "reimbursed", approverId: me.id })
      .where(inArray(benefitClaims.id, ids));

    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "reimburse_batch",
      entity: "benefit_claim",
      entityId: fy,
      payload: {
        fy,
        claimIds: ids,
        count: ids.length,
        totalPaise,
        employeeCount: new Set(payable.map((c) => c.userId)).size,
      },
    });

    return { count: ids.length, totalPaise };
  });

  if (result.count === 0) {
    return { ok: false, message: `No claims awaiting payout for FY ${fy}.` };
  }

  for (const path of ["/expenses/export", "/expenses", "/expenses/history", "/dashboard"]) {
    revalidatePath(path);
  }

  return {
    ok: true,
    count: result.count,
    totalPaise: result.totalPaise,
    message: `Marked ${result.count} claim${result.count === 1 ? "" : "s"} reimbursed for FY ${fy}.`,
  };
}
