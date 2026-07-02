// KAN-79: a "demonstration/tested unit" call of writeCapacitySnapshot — the
// story explicitly asks for the snapshot-writer to be exercised once, without
// wiring a real scheduler (none exists in this repo yet).
//
// writeCapacitySnapshot lives in a `server-only`-guarded module and calls
// getDb()/getAvailabilityForRange, so — unlike the pure shaping tests in
// capacity-forecast.test.ts — it can't be imported as-is outside Next's RSC
// runtime (confirmed: `node -e "require('server-only')"` throws unconditionally,
// there's no dev/test-time carve-out). This test mocks exactly the two seams
// writeCapacitySnapshot touches (the `server-only` marker and `getDb()`'s
// query surface) and stubs `getAvailabilityForRange` so the day-level capacity
// math itself (already covered by capacity-forecast.test.ts and the KAN-75
// suite) isn't re-tested here — only the writer's own scope-resolution +
// insert-shaping logic is.
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const members = [{ id: "u1" }, { id: "u2" }];
let insertedValues: unknown;

function awaitableChain(result: unknown) {
  return {
    where: () => awaitableChain(result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => awaitableChain(members) }),
    insert: () => ({
      values: (v: unknown) => {
        insertedValues = v;
        return {
          returning: () =>
            Promise.resolve([
              { id: "snap-1", computedAt: new Date("2026-07-02T00:00:00Z"), ...(v as Record<string, unknown>) },
            ]),
        };
      },
    }),
  }),
}));

vi.mock("./availability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./availability")>();
  return {
    ...actual,
    // Stub the shared day-level calc — 2 headcount, 1 approved leave -> 50% confirmed.
    getAvailabilityForRange: vi.fn().mockResolvedValue([
      {
        date: "2026-07-02",
        isWeekend: false,
        isHoliday: false,
        holidayName: "",
        isWorkingDay: true,
        headcount: 2,
        onLeave: 1,
        onLeaveApproved: 1,
        onWfh: 0,
        availableCount: 1,
        availablePct: 50,
        availableCountApproved: 1,
        availablePctApproved: 50,
      },
    ]),
  };
});

describe("writeCapacitySnapshot", () => {
  it("computes the confirmed (approved-only) figure for a team scope and inserts one row", async () => {
    const { writeCapacitySnapshot } = await import("./capacity-forecast");

    const row = await writeCapacitySnapshot({ scopeType: "team", scopeId: "manager-1", date: "2026-07-02" });

    expect(row.id).toBe("snap-1");
    expect(insertedValues).toMatchObject({
      date: "2026-07-02",
      scopeType: "team",
      scopeId: "manager-1",
      totalHeadcount: 2, // resolved from the (mocked) member lookup
      availableCount: "1", // the CONFIRMED figure (availableCountApproved), not the pending-inclusive one
      capacityPercent: 50,
    });
  });

  it("throws for a team/department scope with no scopeId (an org snapshot needs none)", async () => {
    const { writeCapacitySnapshot } = await import("./capacity-forecast");
    await expect(writeCapacitySnapshot({ scopeType: "team", scopeId: null })).rejects.toThrow(/scopeId/);
    await expect(writeCapacitySnapshot({ scopeType: "department", scopeId: null })).rejects.toThrow(/scopeId/);
  });
});
