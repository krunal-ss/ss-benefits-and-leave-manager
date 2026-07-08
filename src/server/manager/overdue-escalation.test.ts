// KAN-155: overdue-approval escalation emails. Mocks the same seams as
// capacity-alert.test.ts (server-only + getDb()'s query surface + sendEmail).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmail = vi.fn();
vi.mock("@/server/email", () => ({ sendEmail }));

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
  selectQueue = [];
  insertedValues = [];
});

const NOW = new Date("2026-07-08T12:00:00Z");

describe("notifyOverdueLeaveRequest", () => {
  it("escalates an overdue L1 request to the Project Manager, cc'ing the Team Lead", async () => {
    selectQueue.push([]); // no existing emailLog row for this ref+date
    const { notifyOverdueLeaveRequest } = await import("./overdue-escalation");

    await notifyOverdueLeaveRequest(
      {
        id: "aaaaaaaa-0000-0000-0000-000000000000",
        createdAt: new Date("2026-07-06T00:00:00Z"),
        status: "pending_l1",
        applicantName: "Asha",
        teamLeadEmail: "lead@acme.test",
        projectManagerEmail: "pm@acme.test",
      },
      NOW,
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["pm@acme.test"],
        cc: ["lead@acme.test"],
        subject: "Overdue approval escalation: LR-AAAAAA on 2026-07-08",
      }),
    );
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ status: "sent", template: "overdue_escalation" });
  });

  it("skip-levels an overdue L2 request to HR Head, cc'ing the Project Manager", async () => {
    selectQueue.push([]); // no existing log
    selectQueue.push([{ email: "hr@acme.test" }]); // hr_head users

    const { notifyOverdueLeaveRequest } = await import("./overdue-escalation");
    await notifyOverdueLeaveRequest(
      {
        id: "bbbbbbbb-0000-0000-0000-000000000000",
        createdAt: new Date("2026-07-05T00:00:00Z"),
        status: "pending_l2",
        applicantName: "Ravi",
        teamLeadEmail: "lead@acme.test",
        projectManagerEmail: "pm@acme.test",
      },
      NOW,
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["hr@acme.test"], cc: ["pm@acme.test"] }),
    );
  });

  it("does not send a duplicate escalation for the exact same request+date", async () => {
    selectQueue.push([{ id: "existing-log-row" }]);
    const { notifyOverdueLeaveRequest } = await import("./overdue-escalation");

    await notifyOverdueLeaveRequest(
      {
        id: "aaaaaaaa-0000-0000-0000-000000000000",
        createdAt: new Date("2026-07-06T00:00:00Z"),
        status: "pending_l1",
        applicantName: "Asha",
        teamLeadEmail: "lead@acme.test",
        projectManagerEmail: "pm@acme.test",
      },
      NOW,
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("does nothing for an L1 request with no Project Manager to escalate to", async () => {
    selectQueue.push([]); // no existing log
    const { notifyOverdueLeaveRequest } = await import("./overdue-escalation");

    await notifyOverdueLeaveRequest(
      {
        id: "aaaaaaaa-0000-0000-0000-000000000000",
        createdAt: new Date("2026-07-06T00:00:00Z"),
        status: "pending_l1",
        applicantName: "Asha",
        teamLeadEmail: "lead@acme.test",
        projectManagerEmail: null,
      },
      NOW,
    );

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("logs a failed emailLog row when sendEmail rejects", async () => {
    selectQueue.push([]);
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    const { notifyOverdueLeaveRequest } = await import("./overdue-escalation");

    await notifyOverdueLeaveRequest(
      {
        id: "aaaaaaaa-0000-0000-0000-000000000000",
        createdAt: new Date("2026-07-06T00:00:00Z"),
        status: "pending_l1",
        applicantName: "Asha",
        teamLeadEmail: null,
        projectManagerEmail: "pm@acme.test",
      },
      NOW,
    );

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ status: "failed", template: "overdue_escalation" });
  });
});

describe("notifyOverdueExpenseClaim", () => {
  it("re-notifies every HR Head for an overdue claim", async () => {
    selectQueue.push([]); // no existing log
    selectQueue.push([{ email: "hr1@acme.test" }, { email: "hr2@acme.test" }]); // hr_head users

    const { notifyOverdueExpenseClaim } = await import("./overdue-escalation");
    await notifyOverdueExpenseClaim(
      { id: "cccccccc-0000-0000-0000-000000000000", createdAt: new Date("2026-07-05T00:00:00Z"), applicantName: "Neha" },
      NOW,
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["hr1@acme.test", "hr2@acme.test"], subject: "Overdue approval escalation: BC-CCCCCC on 2026-07-08" }),
    );
  });

  it("does nothing when no HR Head is configured", async () => {
    selectQueue.push([]); // no existing log
    selectQueue.push([]); // no hr_head users

    const { notifyOverdueExpenseClaim } = await import("./overdue-escalation");
    await notifyOverdueExpenseClaim(
      { id: "cccccccc-0000-0000-0000-000000000000", createdAt: new Date("2026-07-05T00:00:00Z"), applicantName: "Neha" },
      NOW,
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });
});
