// KAN-155: covers the job's own logic — finding overdue rows org-wide via
// computeSla (real math, not mocked) and fanning out to the per-item notifier
// (mocked; its own dedup/send behavior is unit-tested in
// overdue-escalation.test.ts) with Promise.allSettled resilience, same shape
// as capacity-snapshot-job.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let selectQueue: unknown[] = [];
function chain(result: unknown) {
  return {
    from: () => chain(result),
    innerJoin: () => chain(result),
    leftJoin: () => chain(result),
    where: () => chain(result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
}
vi.mock("@/db", () => ({ getDb: () => ({ select: () => chain(selectQueue.shift()) }) }));

const notifyOverdueLeaveRequest = vi.fn().mockResolvedValue(undefined);
const notifyOverdueExpenseClaim = vi.fn().mockResolvedValue(undefined);
vi.mock("./overdue-escalation", () => ({ notifyOverdueLeaveRequest, notifyOverdueExpenseClaim }));

beforeEach(() => {
  vi.clearAllMocks();
  notifyOverdueLeaveRequest.mockResolvedValue(undefined);
  notifyOverdueExpenseClaim.mockResolvedValue(undefined);
  selectQueue = [];
});

const NOW = new Date("2026-07-08T12:00:00Z");

const OVERDUE_LEAVE = {
  id: "leave-overdue",
  createdAt: new Date("2026-07-06T00:00:00Z"), // 60h old, > 24h SLA
  status: "pending_l1",
  applicantName: "Asha",
  teamLeadEmail: "lead@acme.test",
  projectManagerEmail: "pm@acme.test",
};
const ON_TRACK_LEAVE = {
  id: "leave-ok",
  createdAt: new Date("2026-07-08T11:00:00Z"), // 1h old, well within 24h SLA
  status: "pending_l2",
  applicantName: "Ravi",
  teamLeadEmail: "lead@acme.test",
  projectManagerEmail: "pm@acme.test",
};
const OVERDUE_EXPENSE = {
  id: "expense-overdue",
  createdAt: new Date("2026-07-05T00:00:00Z"), // 84h old, > 48h SLA
  applicantName: "Neha",
};
const ON_TRACK_EXPENSE = {
  id: "expense-ok",
  createdAt: new Date("2026-07-08T00:00:00Z"), // 12h old, within 48h SLA
  applicantName: "Vik",
};

describe("runOverdueEscalationJob", () => {
  it("escalates only the rows that have actually breached SLA", async () => {
    selectQueue = [
      [OVERDUE_LEAVE, ON_TRACK_LEAVE],
      [OVERDUE_EXPENSE, ON_TRACK_EXPENSE],
    ];
    const { runOverdueEscalationJob } = await import("./overdue-escalation-job");

    const result = await runOverdueEscalationJob(NOW);

    expect(notifyOverdueLeaveRequest).toHaveBeenCalledTimes(1);
    expect(notifyOverdueLeaveRequest).toHaveBeenCalledWith(OVERDUE_LEAVE, NOW);
    expect(notifyOverdueExpenseClaim).toHaveBeenCalledTimes(1);
    expect(notifyOverdueExpenseClaim).toHaveBeenCalledWith(OVERDUE_EXPENSE, NOW);

    expect(result.date).toBe("2026-07-08");
    expect(result.succeeded).toEqual(
      expect.arrayContaining([{ kind: "leave", id: "leave-overdue" }, { kind: "expense", id: "expense-overdue" }]),
    );
    expect(result.failed).toEqual([]);
  });

  it("collects a per-item failure instead of throwing, so one bad email doesn't drop the rest", async () => {
    selectQueue = [[OVERDUE_LEAVE], [OVERDUE_EXPENSE]];
    notifyOverdueLeaveRequest.mockRejectedValueOnce(new Error("boom"));
    notifyOverdueExpenseClaim.mockResolvedValueOnce(undefined);

    const { runOverdueEscalationJob } = await import("./overdue-escalation-job");
    const result = await runOverdueEscalationJob(NOW);

    expect(result.succeeded).toEqual([{ kind: "expense", id: "expense-overdue" }]);
    expect(result.failed).toEqual([{ kind: "leave", id: "leave-overdue", error: "boom" }]);
  });

  it("escalates nothing when no request/claim has breached SLA", async () => {
    selectQueue = [[ON_TRACK_LEAVE], [ON_TRACK_EXPENSE]];
    const { runOverdueEscalationJob } = await import("./overdue-escalation-job");

    const result = await runOverdueEscalationJob(NOW);

    expect(notifyOverdueLeaveRequest).not.toHaveBeenCalled();
    expect(notifyOverdueExpenseClaim).not.toHaveBeenCalled();
    expect(result.succeeded).toEqual([]);
  });
});
