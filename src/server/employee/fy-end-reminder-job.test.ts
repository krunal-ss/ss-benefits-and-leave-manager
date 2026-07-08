// KAN-160: covers the job's own logic — whether today is a reminder day given
// settings + real FY-end date math, and fanning out to the per-employee
// notifier (mocked; its own dedup/send behavior is unit-tested in
// fy-end-reminder.test.ts) with Promise.allSettled resilience.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadReminderSettings = vi.fn();
vi.mock("@/server/hr/reminder-settings", () => ({ loadReminderSettings }));

const getCategoryBalances = vi.fn();
vi.mock("@/server/employee/balances", () => ({ getCategoryBalances }));

const notifyFyEndReminder = vi.fn().mockResolvedValue(undefined);
vi.mock("./fy-end-reminder", () => ({ notifyFyEndReminder }));

let selectResult: unknown[] = [];
function chain(result: unknown) {
  return {
    from: () => chain(result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}
vi.mock("@/db", () => ({ getDb: () => ({ select: () => chain(selectResult) }) }));

const EMPLOYEES = [
  { id: "u1", name: "Asha Rao", email: "asha@acme.test" },
  { id: "u2", name: "Ravi Iyer", email: "ravi@acme.test" },
];

// 2026-27 FY ends 2027-03-31. "now" = 2027-01-01 -> 89 days left.
const NOW = new Date("2027-01-01T00:00:00Z");

function baseSettings(overrides: Partial<{ emailEnabled: boolean; leadDaysBeforeFyEnd: number[]; frequency: string; thresholdPaise: number }> = {}) {
  return {
    emailEnabled: true,
    leadDaysBeforeFyEnd: [90, 60, 30, 7],
    frequency: "once",
    thresholdPaise: 500_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = EMPLOYEES;
  notifyFyEndReminder.mockResolvedValue(undefined);
});

describe("runFyEndReminderJob", () => {
  it("does nothing when emailEnabled is off", async () => {
    loadReminderSettings.mockResolvedValue(baseSettings({ emailEnabled: false }));
    const { runFyEndReminderJob } = await import("./fy-end-reminder-job");

    const result = await runFyEndReminderJob(NOW);

    expect(result.reminderDay).toBe(false);
    expect(getCategoryBalances).not.toHaveBeenCalled();
    expect(notifyFyEndReminder).not.toHaveBeenCalled();
  });

  it("does nothing when today isn't inside the configured reminder window", async () => {
    loadReminderSettings.mockResolvedValue(baseSettings({ leadDaysBeforeFyEnd: [7] })); // window starts at 7 days out; today is 89 days out
    const { runFyEndReminderJob } = await import("./fy-end-reminder-job");

    const result = await runFyEndReminderJob(NOW);

    expect(result.reminderDay).toBe(false);
    expect(notifyFyEndReminder).not.toHaveBeenCalled();
  });

  it("only reminds qualifying employees on an exact checkpoint day (once)", async () => {
    loadReminderSettings.mockResolvedValue(baseSettings()); // 89 days left matches checkpoint 90? no — must be exact
    getCategoryBalances.mockImplementation((userId: string) =>
      Promise.resolve(
        userId === "u1"
          ? [{ categoryId: "c1", key: "sports", label: "Sports", capPaise: 1_500_000, approvedPaise: 0, pendingPaise: 0, availablePaise: 1_500_000 }]
          : [{ categoryId: "c1", key: "sports", label: "Sports", capPaise: 1_500_000, approvedPaise: 1_400_000, pendingPaise: 0, availablePaise: 100_000 }],
    ));

    // 90 days left exactly (checkpoint hit)
    const checkpointNow = new Date("2026-12-31T00:00:00Z");
    const { runFyEndReminderJob } = await import("./fy-end-reminder-job");
    const result = await runFyEndReminderJob(checkpointNow);

    expect(result.reminderDay).toBe(true);
    expect(notifyFyEndReminder).toHaveBeenCalledTimes(1);
    expect(notifyFyEndReminder).toHaveBeenCalledWith(
      EMPLOYEES[0],
      expect.objectContaining({ key: "sports" }),
      "2026-27",
      "once",
      checkpointNow,
    );
    expect(result.succeeded).toEqual([{ userId: "u1", category: "sports" }]);
  });

  it("fires daily only within the final week regardless of configured checkpoints", async () => {
    loadReminderSettings.mockResolvedValue(baseSettings({ frequency: "daily", leadDaysBeforeFyEnd: [90] }));
    getCategoryBalances.mockResolvedValue([
      { categoryId: "c1", key: "sports", label: "Sports", capPaise: 1_500_000, approvedPaise: 0, pendingPaise: 0, availablePaise: 1_500_000 },
    ]);

    // 90 days left — inside the configured window, but not the final week -> no fire
    const outsideFinalWeek = new Date("2026-12-31T00:00:00Z");
    const { runFyEndReminderJob } = await import("./fy-end-reminder-job");
    const notInFinalWeek = await runFyEndReminderJob(outsideFinalWeek);
    expect(notInFinalWeek.reminderDay).toBe(false);

    // 5 days left — inside the final week -> fires
    const insideFinalWeek = new Date("2027-03-26T00:00:00Z");
    const inFinalWeek = await runFyEndReminderJob(insideFinalWeek);
    expect(inFinalWeek.reminderDay).toBe(true);
    expect(notifyFyEndReminder).toHaveBeenCalledTimes(2); // once per employee, both qualify
  });

  it("collects a per-item failure instead of throwing", async () => {
    loadReminderSettings.mockResolvedValue(baseSettings());
    getCategoryBalances.mockResolvedValue([
      { categoryId: "c1", key: "sports", label: "Sports", capPaise: 1_500_000, approvedPaise: 0, pendingPaise: 0, availablePaise: 1_500_000 },
    ]);
    notifyFyEndReminder.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);

    const checkpointNow = new Date("2026-12-31T00:00:00Z");
    const { runFyEndReminderJob } = await import("./fy-end-reminder-job");
    const result = await runFyEndReminderJob(checkpointNow);

    expect(result.succeeded).toEqual([{ userId: "u2", category: "sports" }]);
    expect(result.failed).toEqual([{ userId: "u1", category: "sports", error: "boom" }]);
  });
});
