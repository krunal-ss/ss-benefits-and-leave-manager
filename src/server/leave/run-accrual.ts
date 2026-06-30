import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, leaveBalances, leaveTypes } from "@/db/schema";
import { expectedAccrued, policyFromRow } from "./accrual";
import { fyBounds, todayISO } from "@/lib/fy";

// KAN-43 — DB-applying accrual wrapper. The pure math lives in ./accrual.ts;
// this module persists balances and ALWAYS writes an AuditLog row on a balance
// change (hard rule). Intended caller: a monthly cron / admin "run accrual".

export type AccrualRunResult = {
  fy: string;
  applied: { code: string; from: number; to: number }[];
};

/**
 * Accrue leave for one user up to `asOfISO`, for the FY containing that date.
 * For each balance-deducting type it tops the stored balance UP to the expected
 * accrued amount (it never claws back days already used — usage is deducted on
 * approval, not here). Creates the balance row if missing. Idempotent: only
 * writes when the target differs from the stored balance.
 */
export async function runAccrualForUser(
  userId: string,
  asOfISO: string = todayISO(),
  actorId?: string,
): Promise<AccrualRunResult> {
  const db = getDb();
  const fy = fyBounds(asOfISO).label;
  const types = await db.select().from(leaveTypes);

  const applied: AccrualRunResult["applied"] = [];

  await db.transaction(async (tx) => {
    for (const t of types) {
      if (!t.deductsBalance) continue;
      const target = expectedAccrued(policyFromRow(t), asOfISO);

      const [existing] = await tx
        .select({ id: leaveBalances.id, days: leaveBalances.balanceDays })
        .from(leaveBalances)
        .where(
          and(
            eq(leaveBalances.userId, userId),
            eq(leaveBalances.leaveTypeId, t.id),
            eq(leaveBalances.fy, fy),
          ),
        )
        .limit(1);

      const current = existing ? Number(existing.days) : 0;
      // Never reduce a balance here (usage is deducted on approval, not by accrual).
      if (existing && current >= target) continue;
      if (!existing && target <= 0) continue;

      if (existing) {
        await tx
          .update(leaveBalances)
          .set({ balanceDays: String(target) })
          .where(eq(leaveBalances.id, existing.id));
        await tx.insert(auditLog).values({
          actorId: actorId ?? null,
          action: "accrue_leave_balance",
          entity: "leave_balance",
          entityId: existing.id,
          payload: { code: t.code, fy, from: current, to: target },
        });
      } else {
        const [created] = await tx
          .insert(leaveBalances)
          .values({ userId, leaveTypeId: t.id, balanceDays: String(target), fy })
          .returning({ id: leaveBalances.id });
        await tx.insert(auditLog).values({
          actorId: actorId ?? null,
          action: "accrue_leave_balance",
          entity: "leave_balance",
          entityId: created.id,
          payload: { code: t.code, fy, from: 0, to: target },
        });
      }
      applied.push({ code: t.code, from: current, to: target });
    }
  });

  return { fy, applied };
}
