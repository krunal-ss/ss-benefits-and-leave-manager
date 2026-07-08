// KAN-160: per-employee FY-end reminder email. Mocks the same seams as
// capacity-alert.test.ts (server-only + getDb()'s query surface + sendEmail).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CategoryBalance } from "@/server/employee/balances";

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

const USER = { id: "u1", name: "Asha Rao", email: "asha@acme.test" };
const BALANCE: CategoryBalance = {
  categoryId: "cat-sports",
  key: "sports",
  label: "Sports",
  capPaise: 1_500_000,
  approvedPaise: 0,
  pendingPaise: 0,
  availablePaise: 1_500_000,
};
const NOW = new Date("2026-07-08T12:00:00Z");

describe("notifyFyEndReminder", () => {
  it("sends a reminder and logs it when no prior reminder was sent (once)", async () => {
    selectQueue.push([]); // no existing emailLog row
    const { notifyFyEndReminder } = await import("./fy-end-reminder");

    await notifyFyEndReminder(USER, BALANCE, "2026-27", "once", NOW);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "asha@acme.test", subject: "You have ₹15,000 in unused Sports benefits — FY 2026-27" }),
    );
    expect(insertedValues[0]).toMatchObject({ status: "sent", template: "fy_end_benefit_reminder", toAddress: "asha@acme.test" });
  });

  it("does not send a duplicate for the exact same employee+category+FY (once)", async () => {
    selectQueue.push([{ id: "existing" }]);
    const { notifyFyEndReminder } = await import("./fy-end-reminder");

    await notifyFyEndReminder(USER, BALANCE, "2026-27", "once", NOW);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(insertedValues).toHaveLength(0);
  });

  it("bakes the ISO week start into the subject for weekly cadence", async () => {
    selectQueue.push([]);
    const { notifyFyEndReminder } = await import("./fy-end-reminder");

    await notifyFyEndReminder(USER, BALANCE, "2026-27", "weekly", NOW);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("(week of 2026-07-06)") }));
  });

  it("bakes the exact date into the subject for daily cadence", async () => {
    selectQueue.push([]);
    const { notifyFyEndReminder } = await import("./fy-end-reminder");

    await notifyFyEndReminder(USER, BALANCE, "2026-27", "daily", NOW);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("on 2026-07-08") }));
  });

  it("does not cross-dedup two different employees who happen to have the same subject text", async () => {
    selectQueue.push([]); // dedup query scoped to THIS employee's toAddress finds nothing
    const { notifyFyEndReminder } = await import("./fy-end-reminder");

    await notifyFyEndReminder({ id: "u2", name: "Ravi Iyer", email: "ravi@acme.test" }, BALANCE, "2026-27", "once", NOW);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ravi@acme.test" }));
  });

  it("logs a failed emailLog row when sendEmail rejects", async () => {
    selectQueue.push([]);
    sendEmail.mockRejectedValueOnce(new Error("resend down"));
    const { notifyFyEndReminder } = await import("./fy-end-reminder");

    await notifyFyEndReminder(USER, BALANCE, "2026-27", "once", NOW);

    expect(insertedValues[0]).toMatchObject({ status: "failed", template: "fy_end_benefit_reminder" });
  });
});
