// KAN-155 — same CRON_SECRET auth-gate shape as the capacity-snapshot cron
// route test; the job's own behavior is covered by overdue-escalation-job.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getEnv = vi.fn();
vi.mock("@/lib/env", () => ({ getEnv }));

const runOverdueEscalationJob = vi.fn();
vi.mock("@/server/manager/overdue-escalation-job", () => ({ runOverdueEscalationJob }));

describe("GET /api/cron/overdue-escalation", () => {
  beforeEach(() => {
    getEnv.mockReset();
    runOverdueEscalationJob.mockReset();
  });

  it("returns 500 when CRON_SECRET isn't configured", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: undefined });
    const { GET } = await import("./route");

    const res = await GET(new Request("http://localhost/api/cron/overdue-escalation"));

    expect(res.status).toBe(500);
    expect(runOverdueEscalationJob).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header doesn't match", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: "s3cret" });
    const { GET } = await import("./route");

    const res = await GET(
      new Request("http://localhost/api/cron/overdue-escalation", { headers: { authorization: "Bearer wrong" } }),
    );

    expect(res.status).toBe(401);
    expect(runOverdueEscalationJob).not.toHaveBeenCalled();
  });

  it("runs the job and returns its result when the secret matches", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: "s3cret" });
    runOverdueEscalationJob.mockResolvedValue({ date: "2026-07-08", succeeded: [], failed: [] });
    const { GET } = await import("./route");

    const res = await GET(
      new Request("http://localhost/api/cron/overdue-escalation", { headers: { authorization: "Bearer s3cret" } }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ date: "2026-07-08", succeeded: [], failed: [] });
  });
});
