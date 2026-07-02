import "server-only";
// KAN-79: forward-looking capacity forecast (next 2-4 weeks), Sprint 2 of the
// Smart Team Availability & Capacity Planner epic. Unlike the KAN-75 heatmap
// (a calendar-month grid, past or present), this is always a rolling window
// starting today so a manager can plan around known FUTURE gaps.
//
// Reuses the exact same day-level calc as every other capacity view
// (getAvailabilityForRange in ./availability) and the exact same ownership
// rule (resolveTeamScope) — this module's own job is just picking the date
// window and DB access; the confirmed-vs-at-risk reshaping is a pure
// function in ./capacity-forecast-shape (kept separate so it's unit
// testable without a DB — see capacity-forecast.test.ts).
//
// `writeCapacitySnapshot` persists today's numbers for a scope into
// `teamCapacitySnapshot` (src/db/schema.ts) for FUTURE historical-trend use.
// There is no scheduled job in this repo that calls it — a later story must
// add one before that table has meaningful history. It is exercised directly
// (called once, tested) so the write path is proven correct ahead of that.
import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { teamCapacitySnapshot, users, type User } from "@/db/schema";
import { todayISO } from "@/lib/fy";
import { getAvailabilityForRange, nextISO, resolveTeamScope, type TeamOption } from "./availability";
import { buildForecastPoints, type ForecastPoint } from "./capacity-forecast-shape";

export type { ForecastPoint };
export { buildForecastPoints };

/** Middle of the requested "2-4 weeks" window — see the KAN-79 story notes. */
export const FORECAST_WINDOW_DAYS = 21;

export type CapacityForecastView = {
  startDate: string;
  endDate: string;
  windowDays: number;
  headcount: number;
  teamId: string;
  teamName: string;
  teams: TeamOption[];
  points: ForecastPoint[];
};

/**
 * Forward-looking capacity forecast for `windowDays` (default 21 — the
 * "2-4 weeks" the story asks for) starting today, scoped to the viewer's
 * role exactly like the heatmap (`resolveTeamScope`): a Team Lead/Project
 * Manager always sees their own reports; HR Head/Admin may pass `teamId` to
 * view any team. Always computed LIVE from `leaveRequests` — never reads
 * `teamCapacitySnapshot` (that table is for historical data once a scheduled
 * job populates it; see the KAN-79 note in src/db/schema.ts).
 */
export async function getCapacityForecast(
  user: User,
  teamId?: string,
  windowDays: number = FORECAST_WINDOW_DAYS,
): Promise<CapacityForecastView> {
  const { teamId: effectiveTeamId, teamName, teams, reportIds, headcount } = await resolveTeamScope(user, teamId);

  const startDate = todayISO();
  let endDate = startDate;
  for (let i = 1; i < windowDays; i++) endDate = nextISO(endDate);

  if (!effectiveTeamId) {
    return { startDate, endDate, windowDays, headcount: 0, teamId: effectiveTeamId, teamName, teams, points: [] };
  }

  const rangeDays = await getAvailabilityForRange(reportIds, startDate, endDate);
  const points = buildForecastPoints(rangeDays);

  return { startDate, endDate, windowDays, headcount, teamId: effectiveTeamId, teamName, teams, points };
}

export type SnapshotScopeType = "team" | "department" | "org";

/**
 * Resolve the user ids that make up `scopeType`/`scopeId` for the snapshot
 * writer below — deliberately independent of `resolveTeamScope` (that
 * function enforces viewer-role ownership for the interactive UI; a snapshot
 * writer runs as a trusted background job with an explicit scope, not on
 * behalf of a logged-in viewer).
 */
async function resolveSnapshotScope(scopeType: SnapshotScopeType, scopeId: string | null): Promise<string[]> {
  const db = getDb();
  if (scopeType === "org") {
    const rows = await db.select({ id: users.id }).from(users);
    return rows.map((r) => r.id);
  }
  if (scopeType === "department") {
    if (!scopeId) throw new Error("scopeId is required for a 'department' snapshot.");
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.department, scopeId));
    return rows.map((r) => r.id);
  }
  if (!scopeId) throw new Error("scopeId (a manager's user id) is required for a 'team' snapshot.");
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.teamLeadId, scopeId), eq(users.projectManagerId, scopeId)));
  return rows.map((r) => r.id);
}

export type TeamCapacitySnapshotResult = typeof teamCapacitySnapshot.$inferSelect;

/**
 * Compute today's (or `date`'s) capacity for a scope and persist it into
 * `teamCapacitySnapshot` — a single point-in-time row, for FUTURE use once a
 * scheduled job calls this daily to build up real historical trend data.
 * No such job exists yet in this repo (see the KAN-79 note in
 * src/db/schema.ts); this function is complete and tested but not wired to a
 * scheduler. Records the CONFIRMED (approved-only) figure — a snapshot is a
 * historical record, not an at-risk projection.
 */
export async function writeCapacitySnapshot(params: {
  scopeType: SnapshotScopeType;
  scopeId: string | null;
  date?: string;
}): Promise<TeamCapacitySnapshotResult> {
  const db = getDb();
  const date = params.date ?? todayISO();
  const memberIds = await resolveSnapshotScope(params.scopeType, params.scopeId);
  const totalHeadcount = memberIds.length;

  const [day] = totalHeadcount > 0 ? await getAvailabilityForRange(memberIds, date, date) : [];
  const availableCount = day?.availableCountApproved ?? totalHeadcount;
  const capacityPercent = day?.availablePctApproved ?? (totalHeadcount > 0 ? 100 : 0);

  const [row] = await db
    .insert(teamCapacitySnapshot)
    .values({
      date,
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      totalHeadcount,
      availableCount: String(availableCount),
      capacityPercent,
    })
    .returning();

  return row;
}
