import { describe, it, expect } from "vitest";
import {
  type AccrualPolicy,
  capBalance,
  carryForwardBalance,
  expectedAccrued,
  monthsAccrued,
  splitAgainstBalance,
} from "./accrual";

// KAN-43 — pure accrual math (no DB). FY runs 1 Apr – 31 Mar.

// CL: 1 day/month, cap 12, no carry-forward.
const CL: AccrualPolicy = {
  openingBalanceDays: 0,
  accrualPerMonthDays: 1,
  maxBalanceDays: 12,
  carryForward: false,
  deductsBalance: true,
};
// EL: 1.5 days/month, cap 18, carries forward.
const EL: AccrualPolicy = {
  openingBalanceDays: 0,
  accrualPerMonthDays: 1.5,
  maxBalanceDays: 18,
  carryForward: true,
  deductsBalance: true,
};
// SL: 8 days up-front, cap 8, no accrual.
const SL: AccrualPolicy = {
  openingBalanceDays: 8,
  accrualPerMonthDays: 0,
  maxBalanceDays: 8,
  carryForward: false,
  deductsBalance: true,
};
// LOP: never carries a balance.
const LOP: AccrualPolicy = {
  openingBalanceDays: 0,
  accrualPerMonthDays: 0,
  maxBalanceDays: 0,
  carryForward: false,
  deductsBalance: false,
};

describe("monthsAccrued (credits at start of each FY month)", () => {
  it("is 0 in April (the first FY month)", () => {
    expect(monthsAccrued("2026-04-15")).toBe(0);
  });
  it("is 1 on 1 May", () => {
    expect(monthsAccrued("2026-05-01")).toBe(1);
  });
  it("is 3 in July", () => {
    expect(monthsAccrued("2026-07-10")).toBe(3);
  });
  it("caps at 12 in the following March", () => {
    expect(monthsAccrued("2027-03-31")).toBe(11);
    // Past the FY (April of next FY) resets to that FY's own count.
    expect(monthsAccrued("2027-04-01")).toBe(0);
  });
});

describe("capBalance", () => {
  it("caps at maxBalance", () => {
    expect(capBalance(20, 18)).toBe(18);
  });
  it("passes through when under cap", () => {
    expect(capBalance(5.5, 12)).toBe(5.5);
  });
  it("never goes negative", () => {
    expect(capBalance(-3, 12)).toBe(0);
  });
  it("is uncapped when max is null", () => {
    expect(capBalance(99, null)).toBe(99);
  });
});

describe("expectedAccrued — periodic accrual", () => {
  it("CL accrues 1/month: 3 days by July", () => {
    expect(expectedAccrued(CL, "2026-07-10")).toBe(3);
  });
  it("EL accrues 1.5/month: 4.5 days by July (fractional)", () => {
    expect(expectedAccrued(EL, "2026-07-10")).toBe(4.5);
  });
  it("SL grants the full opening balance immediately", () => {
    expect(expectedAccrued(SL, "2026-04-02")).toBe(8);
    expect(expectedAccrued(SL, "2026-12-02")).toBe(8); // no monthly accrual
  });
  it("LOP never accrues a balance", () => {
    expect(expectedAccrued(LOP, "2026-12-02")).toBe(0);
  });
});

describe("expectedAccrued — cap at maxBalance", () => {
  it("CL caps at 12 even late in the FY", () => {
    // 11 completed months × 1 = 11, plus would-be 12 at year end — never exceeds 12.
    expect(expectedAccrued(CL, "2027-03-31")).toBe(11);
    expect(expectedAccrued({ ...CL, accrualPerMonthDays: 2 }, "2027-03-31")).toBe(12);
  });
  it("EL caps at 18 (12 × 1.5 = 18, never above)", () => {
    expect(expectedAccrued({ ...EL, accrualPerMonthDays: 2 }, "2027-03-15")).toBe(18);
  });
});

describe("carryForwardBalance — FY rollover", () => {
  it("EL carries leftover into the new FY, re-capped", () => {
    expect(carryForwardBalance(EL, 6)).toBe(6); // 6 leftover + 0 opening
  });
  it("EL carry-forward is capped at maxBalance", () => {
    expect(carryForwardBalance(EL, 25)).toBe(18);
  });
  it("CL does NOT carry forward — leftover lapses", () => {
    expect(carryForwardBalance(CL, 7)).toBe(0); // 0 opening, no carry
  });
  it("SL resets to its opening grant each FY", () => {
    expect(carryForwardBalance(SL, 3)).toBe(8); // leftover lapses, opening re-granted
  });
  it("LOP carries nothing", () => {
    expect(carryForwardBalance(LOP, 5)).toBe(0);
  });
});

describe("splitAgainstBalance — PRD §5.5 AC2 over-balance → LOP", () => {
  it("fully within balance → all paid, no LOP", () => {
    expect(splitAgainstBalance(3, 8, true)).toEqual({ paidDays: 3, lopDays: 0, isLop: false });
  });
  it("exactly at balance → all paid, no LOP", () => {
    expect(splitAgainstBalance(8, 8, true)).toEqual({ paidDays: 8, lopDays: 0, isLop: false });
  });
  it("over balance → available paid, remainder LOP", () => {
    expect(splitAgainstBalance(10, 6, true)).toEqual({ paidDays: 6, lopDays: 4, isLop: true });
  });
  it("zero balance → entire request is LOP", () => {
    expect(splitAgainstBalance(2, 0, true)).toEqual({ paidDays: 0, lopDays: 2, isLop: true });
  });
  it("handles fractional half-day requests", () => {
    expect(splitAgainstBalance(2.5, 2, true)).toEqual({ paidDays: 2, lopDays: 0.5, isLop: true });
  });
  it("non-deducting type (LOP) → whole request is LOP", () => {
    expect(splitAgainstBalance(3, 100, false)).toEqual({ paidDays: 0, lopDays: 3, isLop: true });
  });
});
