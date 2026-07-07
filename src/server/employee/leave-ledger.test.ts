// KAN-167 — pure per-account running-balance + reconciliation logic, tested
// in isolation from the DB query (same "mock server-only, test the pure
// helper directly" pattern as ledger.test.ts).
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeLeaveLedger, type LeaveLedgerAccount, type LeaveLedgerSourceEvent } from "./leave-ledger";

function event(overrides: Partial<LeaveLedgerSourceEvent> = {}): LeaveLedgerSourceEvent {
  return {
    id: "OPEN-CL-2026-27",
    dateIso: "2026-04-01",
    type: "opening",
    code: "CL",
    typeLabel: "Casual Leave",
    days: 0,
    ...overrides,
  };
}

function account(overrides: Partial<LeaveLedgerAccount> = {}): LeaveLedgerAccount {
  return {
    code: "CL",
    typeLabel: "Casual Leave",
    fyStartIso: "2026-04-01",
    currentBalanceDays: 0,
    events: [event()],
    ...overrides,
  };
}

describe("computeLeaveLedger", () => {
  it("computes a running balance chronologically, newest first, when the ledger already reconciles", () => {
    const acc = account({
      currentBalanceDays: 2,
      events: [
        event({ id: "OPEN-CL-2026-27", dateIso: "2026-04-01", type: "opening", days: 0 }),
        event({ id: "acc-1", dateIso: "2026-05-01T00:00:00.000Z", type: "accrual", days: 1 }),
        event({ id: "acc-2", dateIso: "2026-06-01T00:00:00.000Z", type: "accrual", days: 1 }),
      ],
    });

    const result = computeLeaveLedger([acc]);

    expect(result.map((r) => r.id)).toEqual(["acc-2", "acc-1", "OPEN-CL-2026-27"]);
    expect(result.map((r) => r.runningBalanceDays)).toEqual([2, 1, 0]);
    // Exact reconciliation — no adjustment row synthesized.
    expect(result.some((r) => r.type === "adjustment")).toBe(false);
  });

  it("inserts a reconciliation 'adjustment' row when the stored balance doesn't match the derived total", () => {
    // Mirrors a brand-new user seeded straight to maxBalanceDays (12) bypassing
    // the audit trail — opening is 0, no audit rows, but the real balance is 12.
    const acc = account({ code: "CL", typeLabel: "Casual Leave", currentBalanceDays: 12, events: [event({ days: 0 })] });

    const result = computeLeaveLedger([acc]);

    expect(result).toHaveLength(2);
    const [adjustment, opening] = result;
    expect(adjustment).toMatchObject({ id: "ADJ-CL", type: "adjustment", days: 12, runningBalanceDays: 12 });
    expect(opening).toMatchObject({ id: "OPEN-CL-2026-27", runningBalanceDays: 0 });
    // Dated at FY start since there are no audit events to be "later than".
    expect(adjustment.dateIso).toBe("2026-04-01");
  });

  it("dates the adjustment row at the last audit event when that's later than FY start", () => {
    const acc = account({
      currentBalanceDays: 10,
      events: [
        event({ id: "OPEN-CL-2026-27", dateIso: "2026-04-01", days: 0 }),
        event({ id: "acc-1", dateIso: "2026-05-15T00:00:00.000Z", type: "accrual", days: 1 }),
      ],
    });

    const result = computeLeaveLedger([acc]);

    const adjustment = result.find((r) => r.type === "adjustment");
    expect(adjustment).toMatchObject({ days: 9, dateIso: "2026-05-15T00:00:00.000Z", runningBalanceDays: 10 });
  });

  it("never omits a non-zero gap, however small", () => {
    const acc = account({ currentBalanceDays: 0.1, events: [event({ days: 0 })] });
    const result = computeLeaveLedger([acc]);
    expect(result.find((r) => r.type === "adjustment")).toMatchObject({ days: 0.1 });
  });

  it("keeps each leave type's running balance independent, then merges all types newest-first", () => {
    const cl = account({
      code: "CL",
      typeLabel: "Casual Leave",
      currentBalanceDays: 1,
      events: [
        event({ id: "OPEN-CL-2026-27", dateIso: "2026-04-01", days: 0 }),
        event({ id: "cl-deduct", dateIso: "2026-06-10T00:00:00.000Z", type: "deduction", code: "CL", days: -1 }),
      ],
    });
    const sl = account({
      code: "SL",
      typeLabel: "Sick Leave",
      currentBalanceDays: 8,
      events: [event({ id: "OPEN-SL-2026-27", dateIso: "2026-04-01", code: "SL", typeLabel: "Sick Leave", days: 8 })],
    });
    // CL's deduction gives a running balance of -1 before reconciliation, so a
    // +2 adjustment is needed to land on the real stored balance of 1.
    const result = computeLeaveLedger([cl, sl]);

    // Newest first across BOTH types: CL's 10-Jun events (deduction +
    // same-day adjustment) beat everything else; the adjustment counts as the
    // more-recent of the tied pair since it reconciles the deduction.
    expect(result[0]).toMatchObject({ id: "ADJ-CL", code: "CL", type: "adjustment", days: 2, runningBalanceDays: 1 });
    expect(result[1]).toMatchObject({ id: "cl-deduct", code: "CL", runningBalanceDays: -1 });
    const clAdjustment = result.find((r) => r.code === "CL" && r.type === "adjustment");
    expect(clAdjustment).toMatchObject({ days: 2, runningBalanceDays: 1 });
    const slOpening = result.find((r) => r.code === "SL");
    expect(slOpening).toMatchObject({ id: "OPEN-SL-2026-27", runningBalanceDays: 8 });
    expect(result.some((r) => r.code === "SL" && r.type === "adjustment")).toBe(false);
  });

  it("returns an empty array for no accounts", () => {
    expect(computeLeaveLedger([])).toEqual([]);
  });
});
