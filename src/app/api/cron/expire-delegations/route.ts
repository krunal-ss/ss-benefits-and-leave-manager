import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runDelegationExpiryJob } from "@/server/manager/delegation-expiry-job";

// KAN-225 — Vercel Cron entry point for the delegation auto-expiry sweep (see
// src/server/manager/delegation-expiry-job.ts and vercel.json). Not user-facing:
// no session/RBAC — Vercel authenticates its scheduled call with
// `Authorization: Bearer $CRON_SECRET` (same shape as the other cron routes).
export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDelegationExpiryJob();
  return NextResponse.json(result);
}
