// KAN-146 — pure sort + running-balance logic, tested in isolation from the
// DB query (same "mock server-only, test the pure helper directly" pattern
// as src/server/manager/capacity-alert.test.ts).
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeLedger, type LedgerSourceEvent } from "./ledger";

function event(overrides: Partial<LedgerSourceEvent> = {}): LedgerSourceEvent {
  return {
    dateIso: "2026-04-01",
    type: "credit",
    categoryKey: "sports",
    categoryLabel: "Sports",
    description: "Annual benefit allocation",
    ref: "ALLOC-SPORTS-2026-27",
    amountPaise: 1_500_000,
    method: "System · FY roll-over",
    isClaim: false,
    ...overrides,
  };
}

describe("computeLedger", () => {
  it("computes a running balance in chronological order, then returns newest first", () => {
    const events: LedgerSourceEvent[] = [
      event({ dateIso: "2026-06-04", type: "debit", ref: "BC-000002", amountPaise: -22_000, isClaim: true }),
      event({ dateIso: "2026-04-01", type: "credit", ref: "ALLOC-LEARNING-2026-27", amountPaise: 4_500_000 }),
      event({ dateIso: "2026-04-01", ref: "ALLOC-SPORTS-2026-27", amountPaise: 1_500_000 }),
    ];

    const result = computeLedger(events);

    // Same-date ties keep their original (chronological-input) relative order —
    // learning was listed before sports, so it's processed first.
    expect(result.map((r) => r.ref)).toEqual(["BC-000002", "ALLOC-SPORTS-2026-27", "ALLOC-LEARNING-2026-27"]);
    // running balance computed chronologically: 4,500,000 -> 6,000,000 -> 5,978,000
    expect(result.map((r) => r.balancePaise)).toEqual([5_978_000, 6_000_000, 4_500_000]);
  });

  it("sorts a bare allocation date before a same-day timestamped claim event", () => {
    const events: LedgerSourceEvent[] = [
      event({ dateIso: "2026-04-01T09:15:00.000Z", type: "reserved", ref: "BC-000001", amountPaise: -5_000, isClaim: true }),
      event({ dateIso: "2026-04-01", ref: "ALLOC-SPORTS-2026-27", amountPaise: 1_500_000 }),
    ];

    const result = computeLedger(events);

    expect(result.map((r) => r.ref)).toEqual(["BC-000001", "ALLOC-SPORTS-2026-27"]);
    expect(result[1]!.balancePaise).toBe(1_500_000);
    expect(result[0]!.balancePaise).toBe(1_495_000);
  });

  it("keeps a rejected claim's net-zero 'released' row at zero delta", () => {
    const events: LedgerSourceEvent[] = [
      event({ ref: "ALLOC-SPORTS-2026-27", amountPaise: 1_500_000 }),
      event({
        dateIso: "2026-05-24T00:00:00.000Z",
        type: "released",
        ref: "BC-000003",
        description: "Hold released · claim rejected",
        amountPaise: 0,
        isClaim: true,
      }),
    ];

    const result = computeLedger(events);

    expect(result[0]).toMatchObject({ ref: "BC-000003", amountPaise: 0, balancePaise: 1_500_000 });
    expect(result[1]).toMatchObject({ ref: "ALLOC-SPORTS-2026-27", balancePaise: 1_500_000 });
  });

  it("assigns each row's id from its ref", () => {
    const result = computeLedger([event({ ref: "ALLOC-SPORTS-2026-27" })]);
    expect(result[0]!.id).toBe("ALLOC-SPORTS-2026-27");
  });

  it("returns an empty array for no events", () => {
    expect(computeLedger([])).toEqual([]);
  });
});
