import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runFyEndReminderJob } from "@/server/employee/fy-end-reminder-job";

// KAN-160 — Vercel Cron entry point for the FY-end benefit reminder job (see
// src/server/employee/fy-end-reminder-job.ts and vercel.json). Not a
// user-facing route: no session, no RBAC — Vercel authenticates its own
// scheduled calls with `Authorization: Bearer $CRON_SECRET`, so that header is
// the only check here (same shape as the capacity-snapshot cron route).
export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runFyEndReminderJob();
  return NextResponse.json(result);
}
