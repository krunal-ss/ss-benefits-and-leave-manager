import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, leaveBalances, leaveTypes } from "@/db/schema";

// KAN-167 (Leave Balance History) — an employee's per-leave-type balance
// ledger, entirely DERIVED from `leaveTypes`/`leaveBalances`/`auditLog`, never
// a stored table (same "don't persist what can be computed" convention as
// KAN-146's wallet ledger, src/server/employee/ledger.ts). Every balance
// change already writes a real `auditLog` row (hard rule) — this just replays
// them into a running-balance view per leave type:
//   1. one synthetic "opening balance" row per type, dated at FY start
//   2. one row per `accrue_leave_balance` / `deduct_leave_balance` /
//      `restore_leave_balance` audit entry for that type's `leaveBalances.id`
//   3. a single reconciliation "adjustment" row IF the running total computed
//      from (1)+(2) doesn't match the actually-stored `leaveBalances.balanceDays`
//      — some balances (e.g. a brand-new user's, see ensureLeaveBalances in
//      current-user.ts) are seeded directly at `maxBalanceDays`, bypassing the
//      audit trail entirely, so this gap is expected and must be surfaced, not
//      swallowed.
// No carry-forward rows: src/server/leave/accrual.ts's carryForwardBalance is
// never called anywhere yet (FY rollover isn't automated), so nothing
// produces that event today.

export type LeaveLedgerEntryType = "opening" | "accrual" | "deduction" | "restore" | "adjustment";

/** One balance-changing event for a single leave type, before running balance is computed. */
export type LeaveLedgerSourceEvent = {
  id: string;
  dateIso: string; // full ISO timestamp, or a bare "YYYY-MM-DD" for the opening/adjustment rows
  type: LeaveLedgerEntryType;
  code: string; // CL/SL/EL/LOP
  typeLabel: string;
  days: number; // signed delta
};

export type LeaveLedgerEntry = LeaveLedgerSourceEvent & {
  runningBalanceDays: number;
};

/** One leave type's full event stream + the real stored balance it must reconcile against. */
export type LeaveLedgerAccount = {
  code: string;
  typeLabel: string;
  fyStartIso: string;
  currentBalanceDays: number;
  events: LeaveLedgerSourceEvent[]; // opening + audit-derived events; reconciliation is added here
};

/** Round to 2 decimals to avoid float drift (same convention as src/server/leave/accrual.ts). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure per-account running-balance computation + reconciliation, factored out
 * from the DB query so it's unit-testable in isolation (see
 * leave-ledger.test.ts). Each account's events are sorted chronologically
 * ascending to compute the balance; if the result doesn't match the account's
 * real stored balance, one final "adjustment" row closes the gap so the
 * ledger's closing balance always reconciles exactly. Within one account, the
 * adjustment row is appended AFTER the last real event even when they share
 * the same dateIso (a bare FY-start date, or the exact timestamp of the last
 * audit event) — it reconciles whatever came before, so on a tie it counts as
 * the more-recent of the two. All accounts' entries are then merged and
 * returned newest-first, matching computeLedger's (KAN-146) display order;
 * the final sort is stable, so same-timestamp ties keep the per-account
 * ordering just established.
 */
export function computeLeaveLedger(accounts: LeaveLedgerAccount[]): LeaveLedgerEntry[] {
  const out: LeaveLedgerEntry[] = [];

  for (const account of accounts) {
    const sorted = [...account.events].sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));

    let balance = 0;
    const withBalance: LeaveLedgerEntry[] = sorted.map((e) => {
      balance = round2(balance + e.days);
      return { ...e, runningBalanceDays: balance };
    });

    const diff = round2(account.currentBalanceDays - balance);
    if (diff !== 0) {
      const lastDateIso = sorted.length > 0 ? sorted[sorted.length - 1].dateIso : account.fyStartIso;
      // "the later of FY start or the last audit event"
      const adjustmentDateIso = lastDateIso > account.fyStartIso ? lastDateIso : account.fyStartIso;
      balance = round2(balance + diff);
      withBalance.push({
        id: `ADJ-${account.code}`,
        dateIso: adjustmentDateIso,
        type: "adjustment",
        code: account.code,
        typeLabel: account.typeLabel,
        days: diff,
        runningBalanceDays: balance,
      });
    }

    // Newest-first within this account (ascending -> reverse), so a same-date
    // tie with the adjustment row already orders correctly before the merge.
    out.push(...withBalance.reverse());
  }

  return out.sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
}

function signedDaysFromPayload(action: string, payload: Record<string, unknown> | null): number {
  const p = payload ?? {};
  if (action === "accrue_leave_balance") {
    const from = typeof p.from === "number" ? p.from : Number(p.from ?? 0);
    const to = typeof p.to === "number" ? p.to : Number(p.to ?? 0);
    return round2(to - from);
  }
  const days = typeof p.days === "number" ? p.days : Number(p.days ?? 0);
  if (action === "deduct_leave_balance") return round2(-days);
  if (action === "restore_leave_balance") return round2(days);
  return 0;
}

function entryTypeForAction(action: string): LeaveLedgerEntryType | null {
  if (action === "accrue_leave_balance") return "accrual";
  if (action === "deduct_leave_balance") return "deduction";
  if (action === "restore_leave_balance") return "restore";
  return null;
}

/**
 * The employee's own leave balance history for one FY, across every leave
 * type that draws a balance, newest first with a running balance per type.
 * Caller must always pass the requesting user's own `userId` — there is no
 * separate ownership check here (see src/app/(app)/leave/page.tsx's call site,
 * which always passes the signed-in user's id, same as getWalletLedger's).
 */
export async function getLeaveBalanceHistory(userId: string, fy: string): Promise<LeaveLedgerEntry[]> {
  const db = getDb();
  const fyStartIso = `${fy.split("-")[0]}-04-01`;

  const types = await db.select().from(leaveTypes);
  const balances = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.fy, fy)));

  const balanceByTypeId = new Map(balances.map((b) => [b.leaveTypeId, b]));
  const balanceIds = balances.map((b) => b.id);

  const auditRows = balanceIds.length
    ? await db.select().from(auditLog).where(and(eq(auditLog.entity, "leave_balance"), inArray(auditLog.entityId, balanceIds)))
    : [];

  const auditByBalanceId = new Map<string, typeof auditRows>();
  for (const row of auditRows) {
    if (!row.entityId) continue;
    const list = auditByBalanceId.get(row.entityId) ?? [];
    list.push(row);
    auditByBalanceId.set(row.entityId, list);
  }

  const accounts: LeaveLedgerAccount[] = [];

  for (const t of types) {
    const balance = balanceByTypeId.get(t.id);
    if (!balance) continue; // no balance row for this FY — nothing to reconcile against

    const events: LeaveLedgerSourceEvent[] = [
      {
        id: `OPEN-${t.code}-${fy}`,
        dateIso: fyStartIso,
        type: "opening",
        code: t.code,
        typeLabel: t.name,
        days: round2(Number(t.openingBalanceDays)),
      },
    ];

    for (const row of auditByBalanceId.get(balance.id) ?? []) {
      const entryType = entryTypeForAction(row.action);
      if (!entryType) continue;
      events.push({
        id: row.id,
        dateIso: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        type: entryType,
        code: t.code,
        typeLabel: t.name,
        days: signedDaysFromPayload(row.action, row.payload),
      });
    }

    accounts.push({
      code: t.code,
      typeLabel: t.name,
      fyStartIso,
      currentBalanceDays: round2(Number(balance.balanceDays)),
      events,
    });
  }

  return computeLeaveLedger(accounts);
}
