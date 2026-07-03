// KAN-79: covers the daily snapshot job's own logic — scope enumeration
// (org + every real department + every manager's team) and its
// resilient-to-partial-failure aggregation. The day-level capacity math and
// writeCapacitySnapshot's own insert-shaping are already covered by
// capacity-forecast.test.ts and capacity-forecast.write-snapshot.test.ts, so
// this mocks writeCapacitySnapshot itself rather than re-testing it.
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const departmentRows = [{ department: "Engineering" }, { department: "Sales" }, { department: null }];
const teamOptions = [{ id: "mgr-1", name: "Asha" }, { id: "mgr-2", name: "Ravi" }];

vi.mock("@/db", () => ({
  getDb: () => ({
    selectDistinct: () => ({
      from: () => ({
        where: () => Promise.resolve(departmentRows),
      }),
    }),
  }),
}));

vi.mock("./availability", () => ({
  listTeamOptions: vi.fn().mockResolvedValue(teamOptions),
}));

const writeCapacitySnapshot = vi.fn();
vi.mock("./capacity-forecast", () => ({ writeCapacitySnapshot }));

describe("runDailyCapacitySnapshotJob", () => {
  it("snapshots the org, every non-null department, and every manager's team for the given date", async () => {
    writeCapacitySnapshot.mockImplementation((params: { scopeType: string; scopeId: string | null; date: string }) =>
      Promise.resolve({ id: `${params.scopeType}-${params.scopeId ?? "org"}`, ...params }),
    );
    const { runDailyCapacitySnapshotJob } = await import("./capacity-snapshot-job");

    const result = await runDailyCapacitySnapshotJob("2026-07-03");

    expect(result.date).toBe("2026-07-03");
    expect(result.failed).toEqual([]);
    expect(writeCapacitySnapshot).toHaveBeenCalledWith({ scopeType: "org", scopeId: null, date: "2026-07-03" });
    expect(writeCapacitySnapshot).toHaveBeenCalledWith({ scopeType: "department", scopeId: "Engineering", date: "2026-07-03" });
    expect(writeCapacitySnapshot).toHaveBeenCalledWith({ scopeType: "department", scopeId: "Sales", date: "2026-07-03" });
    expect(writeCapacitySnapshot).toHaveBeenCalledWith({ scopeType: "team", scopeId: "mgr-1", date: "2026-07-03" });
    expect(writeCapacitySnapshot).toHaveBeenCalledWith({ scopeType: "team", scopeId: "mgr-2", date: "2026-07-03" });
    // org + 2 departments + 2 teams — the null department must not produce its own scope.
    expect(writeCapacitySnapshot).toHaveBeenCalledTimes(5);
    expect(result.succeeded).toHaveLength(5);
  });

  it("collects a per-scope failure instead of throwing, so one bad scope doesn't drop the rest", async () => {
    writeCapacitySnapshot.mockReset();
    writeCapacitySnapshot.mockImplementation((params: { scopeType: string; scopeId: string | null }) =>
      params.scopeType === "department" && params.scopeId === "Sales"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ id: "ok", ...params }),
    );
    const { runDailyCapacitySnapshotJob } = await import("./capacity-snapshot-job");

    const result = await runDailyCapacitySnapshotJob("2026-07-03");

    expect(result.succeeded).toHaveLength(4);
    expect(result.failed).toEqual([{ scopeType: "department", scopeId: "Sales", error: "boom" }]);
  });
});
