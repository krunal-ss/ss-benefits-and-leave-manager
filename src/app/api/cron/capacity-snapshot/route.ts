import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runDailyCapacitySnapshotJob } from "@/server/manager/capacity-snapshot-job";

// KAN-79 — Vercel Cron entry point for the daily teamCapacitySnapshot job
// (see src/server/manager/capacity-snapshot-job.ts and vercel.json). Not a
// user-facing route: no session, no RBAC — Vercel authenticates its own
// scheduled calls with `Authorization: Bearer $CRON_SECRET`, so that header is
// the only check here.
export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyCapacitySnapshotJob();
  return NextResponse.json(result);
}
