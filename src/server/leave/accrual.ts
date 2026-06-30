import { fyBounds, todayISO } from "@/lib/fy";

// KAN-43 — Leave balances, accrual & carry-forward: PURE engine.
//
// This module is intentionally free of DB / server-only imports so the accrual
// MATH is unit-testable without a database (see accrual.test.ts). The thin
// DB-applying wrapper that persists balances + writes AuditLog rows lives in
// run-accrual.ts (a Server-only module that imports from here).

/** Per-type accrual policy — the structured subset of a `leaveTypes` row. */
export type AccrualPolicy = {
  /** Days granted up-front at FY start, before any periodic accrual. */
  openingBalanceDays: number;
  /** Days credited each completed month. 0 = no periodic accrual (e.g. LOP). */
  accrualPerMonthDays: number;
  /** Hard cap on the balance; null = uncapped. */
  maxBalanceDays: number | null;
  /** Whether leftover balance rolls into the next FY. */
  carryForward: boolean;
  /** Whether this type draws down a balance at all (false for LOP). */
  deductsBalance: boolean;
};

/** Clamp a balance to its cap (if any). Never negative. */
export function capBalance(days: number, maxBalanceDays: number | null): number {
  const floored = Math.max(0, round2(days));
  if (maxBalanceDays === null) return floored;
  return Math.min(floored, round2(maxBalanceDays));
}

/**
 * Number of accrual months credited for an as-of date within its FY.
 * Accrual credits at the START of each FY month (KEKA-style): April (the first
 * FY month) is month 0, so in April nothing has accrued yet; on 1 May one month
 * has accrued, and so on through 12 by the following March. Bounded to 0..12.
 */
export function monthsAccrued(asOfISO: string): number {
  const { start } = fyBounds(asOfISO);
  const [sy, sm] = start.split("-").map(Number);
  const [ay, am] = asOfISO.split("-").map(Number);
  const months = (ay - sy) * 12 + (am - sm);
  return Math.max(0, Math.min(12, months));
}

/**
 * Expected accrued balance for one type as of `asOfISO`, ignoring usage:
 *   opening + (completedMonths × monthlyRate), capped at maxBalance.
 * Pure — this is the canonical accrual formula the engine and tests share.
 */
export function expectedAccrued(policy: AccrualPolicy, asOfISO: string = todayISO()): number {
  if (!policy.deductsBalance) return 0; // LOP-style types never carry a balance
  const months = monthsAccrued(asOfISO);
  const raw = policy.openingBalanceDays + months * policy.accrualPerMonthDays;
  return capBalance(raw, policy.maxBalanceDays);
}

/**
 * Carry-forward at FY rollover. Returns the opening balance for the NEW FY:
 * - carryForward types: prior closing balance, capped at maxBalance, plus the
 *   new FY's own opening grant (also re-capped).
 * - non-carryForward types: just the new FY opening grant (leftover lapses).
 */
export function carryForwardBalance(policy: AccrualPolicy, priorClosingDays: number): number {
  if (!policy.deductsBalance) return 0;
  const carried = policy.carryForward ? Math.max(0, round2(priorClosingDays)) : 0;
  return capBalance(carried + policy.openingBalanceDays, policy.maxBalanceDays);
}

/** Round to 2 decimals to avoid float drift on fractional (half-day) accruals. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// PRD §5.5 AC2 — over-balance policy. A leave request that exceeds available
// balance is NOT hard-blocked: the available portion deducts the type balance
// and the remainder is flagged as LOP (unpaid). Pure + testable.
// ---------------------------------------------------------------------------

export type BalanceSplit = {
  /** Working days drawn from the type's balance (≤ available, ≤ requested). */
  paidDays: number;
  /** Working days that exceed balance and become Loss of Pay. */
  lopDays: number;
  /** True when any portion spills into LOP. */
  isLop: boolean;
};

/**
 * Split a requested working-day count against an available balance.
 * - Within balance → all paid, no LOP.
 * - Over balance   → available is paid, the rest is LOP.
 * Non-balance-deducting types (LOP itself, WFH handled upstream) pass through
 * as fully LOP when `deductsBalance` is false.
 */
export function splitAgainstBalance(
  requestedDays: number,
  availableDays: number,
  deductsBalance = true,
): BalanceSplit {
  const requested = Math.max(0, round2(requestedDays));
  if (!deductsBalance) return { paidDays: 0, lopDays: requested, isLop: requested > 0 };
  const available = Math.max(0, round2(availableDays));
  const paidDays = round2(Math.min(requested, available));
  const lopDays = round2(requested - paidDays);
  return { paidDays, lopDays, isLop: lopDays > 0 };
}

/** Map a raw `leaveTypes` row (numerics are strings) to a typed AccrualPolicy. */
export function policyFromRow(t: {
  openingBalanceDays: string;
  accrualPerMonthDays: string;
  maxBalanceDays: string | null;
  carryForward: boolean;
  deductsBalance: boolean;
}): AccrualPolicy {
  return {
    openingBalanceDays: Number(t.openingBalanceDays),
    accrualPerMonthDays: Number(t.accrualPerMonthDays),
    maxBalanceDays: t.maxBalanceDays === null ? null : Number(t.maxBalanceDays),
    carryForward: t.carryForward,
    deductsBalance: t.deductsBalance,
  };
}
