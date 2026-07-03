import "server-only";
// KAN-79: the daily scheduled job that finally calls `writeCapacitySnapshot`
// regularly — closing the gap this story and the `teamCapacitySnapshot`
// comment (src/db/schema.ts) both flag: until now nothing in the repo invoked
// it on a schedule. Triggered by the Vercel Cron route at
// src/app/api/cron/capacity-snapshot/route.ts once a day.
//
// Snapshots every scope the rest of the epic already understands — the whole
// org, each real department (same `users.department` convention as KAN-74's
// thresholds and KAN-78's department overview), and each manager's team
// (KAN-75's `listTeamOptions`) — so whichever scope a future historical-trend
// view wants to chart already has data building up.
import { isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { todayISO } from "@/lib/fy";
import { listTeamOptions } from "./availability";
import { writeCapacitySnapshot, type SnapshotScopeType, type TeamCapacitySnapshotResult } from "./capacity-forecast";

type SnapshotScope = { scopeType: SnapshotScopeType; scopeId: string | null };

async function listSnapshotScopes(): Promise<SnapshotScope[]> {
  const db = getDb();
  const departmentRows = await db.selectDistinct({ department: users.department }).from(users).where(isNotNull(users.department));
  const departments = departmentRows.map((r) => r.department?.trim()).filter((d): d is string => !!d);

  const teams = await listTeamOptions();

  return [
    { scopeType: "org", scopeId: null },
    ...departments.map((department) => ({ scopeType: "department" as const, scopeId: department })),
    ...teams.map((team) => ({ scopeType: "team" as const, scopeId: team.id })),
  ];
}

export type CapacitySnapshotJobResult = {
  date: string;
  succeeded: TeamCapacitySnapshotResult[];
  failed: (SnapshotScope & { error: string })[];
};

/**
 * Writes one `teamCapacitySnapshot` row per scope (org + every department +
 * every manager's team) for `date` (defaults to today). Resilient to a single
 * scope's failure — one bad department shouldn't drop the rest of the day's
 * snapshot, so failures are collected rather than thrown.
 */
export async function runDailyCapacitySnapshotJob(date?: string): Promise<CapacitySnapshotJobResult> {
  const effectiveDate = date ?? todayISO();
  const scopes = await listSnapshotScopes();
  const results = await Promise.allSettled(scopes.map((scope) => writeCapacitySnapshot({ ...scope, date: effectiveDate })));

  const succeeded: TeamCapacitySnapshotResult[] = [];
  const failed: CapacitySnapshotJobResult["failed"] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") succeeded.push(result.value);
    else failed.push({ ...scopes[i], error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });

  return { date: effectiveDate, succeeded, failed };
}
