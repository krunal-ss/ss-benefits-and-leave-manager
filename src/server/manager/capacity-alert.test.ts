// KAN-81: low-staffing email notifications. Covers the acceptance criteria
// directly — exactly one email per breach (no duplicate spam), no email
// while healthy or unconfigured, and "team" scope is never checked (KAN-74
// thresholds only exist at org/department scope). Mocks the same seams as
// capacity-forecast.write-snapshot.test.ts (server-only + getDb()'s query
// surface) plus listThresholds and sendEmail.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamCapacitySnapshotResult } from "./capacity-forecast";

vi.mock("server-only", () => ({}));

const listThresholds = vi.fn();
vi.mock("@/server/hr/staffing-thresholds", () => ({ listThresholds }));

const sendEmail = vi.fn();
vi.mock("@/server/email", () => ({ sendEmail }));

// KAN-168 — mocked at the preferences-module boundary (not the raw DB) so
// these pre-existing tests don't need to know about the extra
// notification_preferences select per recipient; defaults to "allowed" like a
// user who never touched their preferences. See the dedicated test below for
// the "recipient opted out" behavior.
const isNotificationAllowed = vi.fn().mockResolvedValue(true);
vi.mock("@/server/notifications/preferences", () => ({ isNotificationAllowed }));

let selectQueue: unknown[] = [];
let insertedValues: unknown[] = [];

function chain(result: unknown) {
  return {
    from: () => chain(result),
    where: () => chain(result),
    limit: () => chain(result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => chain(selectQueue.shift()),
    insert: () => ({
      values: (v: unknown) => {
        insertedValues.push(v);
        return Promise.resolve(undefined);
      },
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  isNotificationAllowed.mockReset().mockResolvedValue(true);
  selectQueue = [];
  insertedValues = [];
});

function makeSnapshot(overrides: Partial<TeamCapacitySnapshotResult> = {}): TeamCapacitySnapshotResult {
  return {
    id: "snap-1",
    date: "2026-07-03",
    scopeType: "org",
    scopeId: null,
    totalHeadcount: 10,
    availableCount: "6",
    capacityPercent: 60,
    computedAt: new Date("2026-07-03T00:00:00Z"),
    ...overrides,
  };
}

describe("checkLowStaffingAndNotify", () => {
  it("sends exactly one email when a scope breaches its threshold", async () => {
    listThresholds.mockResolvedValue({
      orgDefault: { id: "t1", scope: "org", scopeValue: null, minAvailablePercent: 80, updatedAt: new Date(), updatedBy: "u" },
      departmentOverrides: [],
    });
    selectQueue.push([]); // no existing emailLog row for this scope+date
    selectQueue.push([{ email: "hr@acme.test" }]); // hr_head users

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ capacityPercent: 60 }));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["hr@acme.test"], subject: "Low staffing alert: Organization on 2026-07-03" }),
    );
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ status: "sent", template: "low_staffing_alert", toAddress: "hr@acme.test" });
  });

  it("does not send an email when capacity is at/above the threshold", async () => {
    listThresholds.mockResolvedValue({ orgDefault: { minAvailablePercent: 80 }, departmentOverrides: [] });

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ capacityPercent: 80 }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("does not send an email when no threshold is configured for the scope", async () => {
    listThresholds.mockResolvedValue({ orgDefault: null, departmentOverrides: [] });

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ scopeType: "department", scopeId: "Sales", capacityPercent: 10 }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("does not send a duplicate email when a breach for this exact scope+date was already logged", async () => {
    listThresholds.mockResolvedValue({ orgDefault: { minAvailablePercent: 80 }, departmentOverrides: [] });
    selectQueue.push([{ id: "existing-log-row" }]); // dedup check finds a prior row for this subject+template

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ capacityPercent: 50 }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("never checks a team-scope snapshot — no threshold exists at that scope", async () => {
    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ scopeType: "team", scopeId: "mgr-1", capacityPercent: 10 }));

    expect(listThresholds).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("CCs the department's team leads/project managers for a department-scope breach", async () => {
    listThresholds.mockResolvedValue({
      orgDefault: { minAvailablePercent: 80 },
      departmentOverrides: [{ scopeValue: "Engineering", minAvailablePercent: 70 }],
    });
    selectQueue.push([]); // no existing log
    selectQueue.push([{ email: "hr@acme.test" }]); // hr heads
    selectQueue.push([{ email: "lead@acme.test" }, { email: "pm@acme.test" }]); // department managers

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ scopeType: "department", scopeId: "Engineering", capacityPercent: 50 }));

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["hr@acme.test"],
        cc: ["lead@acme.test", "pm@acme.test"],
        subject: "Low staffing alert: Engineering on 2026-07-03",
      }),
    );
  });

  it("does nothing when no HR Head is configured to notify", async () => {
    listThresholds.mockResolvedValue({ orgDefault: { minAvailablePercent: 80 }, departmentOverrides: [] });
    selectQueue.push([]); // no existing log
    selectQueue.push([]); // no hr_head users

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ capacityPercent: 50 }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("KAN-168: skips an HR Head who has email notifications off, still sends to the rest", async () => {
    listThresholds.mockResolvedValue({ orgDefault: { minAvailablePercent: 80 }, departmentOverrides: [] });
    selectQueue.push([]); // no existing log
    selectQueue.push([
      { id: "hr-1", email: "opted-out@acme.test" },
      { id: "hr-2", email: "hr@acme.test" },
    ]);
    isNotificationAllowed.mockImplementation(async (userId: string) => userId !== "hr-1");

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ capacityPercent: 50 }));

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ["hr@acme.test"] }));
  });

  it("logs a failed emailLog row when sendEmail rejects, so the attempt stays traceable", async () => {
    listThresholds.mockResolvedValue({ orgDefault: { minAvailablePercent: 80 }, departmentOverrides: [] });
    selectQueue.push([]); // no existing log
    selectQueue.push([{ email: "hr@acme.test" }]); // hr heads
    sendEmail.mockRejectedValueOnce(new Error("resend down"));

    const { checkLowStaffingAndNotify } = await import("./capacity-alert");
    await checkLowStaffingAndNotify(makeSnapshot({ capacityPercent: 50 }));

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ status: "failed", template: "low_staffing_alert" });
  });
});
