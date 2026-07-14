// KAN-160 — same CRON_SECRET auth-gate shape as the capacity-snapshot cron
// route test; the job's own behavior is covered by fy-end-reminder-job.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getEnv = vi.fn();
vi.mock("@/lib/env", () => ({ getEnv }));

const runFyEndReminderJob = vi.fn();
vi.mock("@/server/employee/fy-end-reminder-job", () => ({ runFyEndReminderJob }));

describe("GET /api/cron/fy-end-reminder", () => {
  beforeEach(() => {
    getEnv.mockReset();
    runFyEndReminderJob.mockReset();
  });

  it("returns 500 when CRON_SECRET isn't configured", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: undefined });
    const { GET } = await import("./route");

    const res = await GET(new Request("http://localhost/api/cron/fy-end-reminder"));

    expect(res.status).toBe(500);
    expect(runFyEndReminderJob).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header doesn't match", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: "s3cret" });
    const { GET } = await import("./route");

    const res = await GET(
      new Request("http://localhost/api/cron/fy-end-reminder", { headers: { authorization: "Bearer wrong" } }),
    );

    expect(res.status).toBe(401);
    expect(runFyEndReminderJob).not.toHaveBeenCalled();
  });

  it("runs the job and returns its result when the secret matches", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: "s3cret" });
    runFyEndReminderJob.mockResolvedValue({ date: "2026-07-08", reminderDay: true, succeeded: [], failed: [] });
    const { GET } = await import("./route");

    const res = await GET(
      new Request("http://localhost/api/cron/fy-end-reminder", { headers: { authorization: "Bearer s3cret" } }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ date: "2026-07-08", reminderDay: true, succeeded: [], failed: [] });
  });
});
