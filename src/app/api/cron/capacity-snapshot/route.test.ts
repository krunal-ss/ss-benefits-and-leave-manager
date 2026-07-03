// KAN-79 — the cron route has no session/RBAC (it's not user-facing), so the
// only thing worth unit-testing here is the CRON_SECRET auth gate and that a
// successful call delegates to the job and returns its result. The job's own
// behavior is covered by capacity-snapshot-job.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

const getEnv = vi.fn();
vi.mock("@/lib/env", () => ({ getEnv }));

const runDailyCapacitySnapshotJob = vi.fn();
vi.mock("@/server/manager/capacity-snapshot-job", () => ({ runDailyCapacitySnapshotJob }));

describe("GET /api/cron/capacity-snapshot", () => {
  beforeEach(() => {
    getEnv.mockReset();
    runDailyCapacitySnapshotJob.mockReset();
  });

  it("returns 500 when CRON_SECRET isn't configured", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: undefined });
    const { GET } = await import("./route");

    const res = await GET(new Request("http://localhost/api/cron/capacity-snapshot"));

    expect(res.status).toBe(500);
    expect(runDailyCapacitySnapshotJob).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header doesn't match", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: "s3cret" });
    const { GET } = await import("./route");

    const res = await GET(
      new Request("http://localhost/api/cron/capacity-snapshot", { headers: { authorization: "Bearer wrong" } }),
    );

    expect(res.status).toBe(401);
    expect(runDailyCapacitySnapshotJob).not.toHaveBeenCalled();
  });

  it("runs the job and returns its result when the secret matches", async () => {
    getEnv.mockReturnValue({ CRON_SECRET: "s3cret" });
    runDailyCapacitySnapshotJob.mockResolvedValue({ date: "2026-07-03", succeeded: [], failed: [] });
    const { GET } = await import("./route");

    const res = await GET(
      new Request("http://localhost/api/cron/capacity-snapshot", { headers: { authorization: "Bearer s3cret" } }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ date: "2026-07-03", succeeded: [], failed: [] });
  });
});
