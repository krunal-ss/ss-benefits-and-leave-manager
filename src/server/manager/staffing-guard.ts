// KAN-77: leave conflict & critical-role guard, consulted (advisory only,
// never blocking — see CLAUDE.md / the story's own AC) at both apply time
// (src/server/actions/leave.ts) and approval time
// (src/server/actions/approve-leave.ts). Two independent checks per day in
// the request's range:
//
//   (a) THRESHOLD — would the team's post-request availablePct drop below the
//       configured staffing threshold (KAN-74; department override wins over
//       the org default)? Reuses getAvailabilityForRange (KAN-75/76) for the
//       day-level capacity calc rather than recomputing it here.
//   (b) CRITICAL ROLE — if the requester is flagged isCriticalRole, would no
//       OTHER critical-role holder on the same team be available that day?
//       WFH counts as available (BR3, same as the threshold calc); only an
//       overlapping "leave" request removes availability.
//
// "Team" = the requester's own reporting line (other users sharing the same
// users.teamLeadId) — the same definition of "team" used by the availability
// heatmap, independent of which Team Lead a particular request happens to be
// routed through.
import "server-only";
import { and, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { leaveRequests, users } from "@/db/schema";
import { getAvailabilityForRange, nextISO } from "./availability";
import { listThresholds } from "@/server/hr/staffing-thresholds";

export type StaffingWarning = {
  date: string; // ISO yyyy-mm-dd
  type: "threshold" | "critical_role";
  message: string;
};

export type StaffingGuardInput = {
  requesterId: string;
  /** Other users reporting to the same Team Lead define "the team" for this check. */
  teamLeadId: string | null;
  department: string | null;
  isCriticalRole: boolean;
  kind: "leave" | "wfh";
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  /**
   * true when this request row already exists in `leaveRequests` (the
   * approval-time check — a pending request is already reflected in the DB
   * availability numbers). false for a not-yet-inserted apply-time check,
   * where this request's own impact must be simulated on top of the current
   * DB state.
   */
  persisted: boolean;
};

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  while (d <= to) {
    out.push(d);
    d = nextISO(d);
  }
  return out;
}

/**
 * Advisory-only staffing warnings for a leave/WFH request. Never throws for a
 * "would breach" condition — callers must attach the result to their action's
 * return value and let the human decide; only genuine errors (bad input) throw.
 */
export async function checkStaffingWarnings(input: StaffingGuardInput): Promise<StaffingWarning[]> {
  const { teamLeadId, kind } = input;
  if (!teamLeadId || kind !== "leave") return []; // no team scope, or WFH (never reduces availability — BR3)

  const db = getDb();

  const teamRows = await db
    .select({ id: users.id, isCriticalRole: users.isCriticalRole })
    .from(users)
    .where(eq(users.teamLeadId, teamLeadId));
  const reportIds = teamRows.map((r) => r.id);
  if (reportIds.length === 0) return [];

  const warnings: StaffingWarning[] = [];
  const unit = input.halfDay ? 0.5 : 1;
  const extraUnavailable = input.persisted ? 0 : unit; // apply-time: simulate this request's own impact

  const rangeDays = await getAvailabilityForRange(reportIds, input.fromDate, input.toDate);
  const rangeByDate = new Map(rangeDays.map((d) => [d.date, d]));

  // ---- (a) threshold check ----
  const thresholds = await listThresholds();
  const applicable =
    (input.department
      ? thresholds.departmentOverrides.find((t) => t.scopeValue === input.department)
      : undefined) ?? thresholds.orgDefault;

  if (applicable) {
    for (const day of rangeDays) {
      if (!day.isWorkingDay || day.availablePct === null || day.headcount === 0) continue;
      const projectedAvailable = Math.max(0, day.availableCount - extraUnavailable);
      const projectedPct = Math.round((projectedAvailable / day.headcount) * 100);
      if (projectedPct < applicable.minAvailablePercent) {
        const scopeLabel = applicable.scope === "department" ? `the "${applicable.scopeValue}" department` : "the org";
        warnings.push({
          date: day.date,
          type: "threshold",
          message: `Team availability on ${day.date} would drop to ${projectedPct}%, below the ${applicable.minAvailablePercent}% minimum configured for ${scopeLabel}.`,
        });
      }
    }
  }

  // ---- (b) critical-role check ----
  if (input.isCriticalRole) {
    const otherCriticalIds = teamRows.filter((r) => r.isCriticalRole && r.id !== input.requesterId).map((r) => r.id);

    // Per-day set of "other critical holder" ids who are themselves on an
    // overlapping leave request (WFH doesn't count — still available).
    const unavailableOtherByDate = new Map<string, Set<string>>();
    if (otherCriticalIds.length > 0) {
      const rows = await db
        .select({ userId: leaveRequests.userId, from: leaveRequests.fromDate, to: leaveRequests.toDate })
        .from(leaveRequests)
        .where(
          and(
            inArray(leaveRequests.userId, otherCriticalIds),
            eq(leaveRequests.kind, "leave"),
            lte(leaveRequests.fromDate, input.toDate),
            gte(leaveRequests.toDate, input.fromDate),
            notInArray(leaveRequests.status, ["rejected", "cancelled"]),
          ),
        );
      for (const r of rows) {
        let d = r.from < input.fromDate ? input.fromDate : r.from;
        const end = r.to > input.toDate ? input.toDate : r.to;
        while (d <= end) {
          const set = unavailableOtherByDate.get(d) ?? new Set<string>();
          set.add(r.userId);
          unavailableOtherByDate.set(d, set);
          d = nextISO(d);
        }
      }
    }

    for (const date of datesBetween(input.fromDate, input.toDate)) {
      const day = rangeByDate.get(date);
      if (!day || !day.isWorkingDay) continue; // no coverage expectation on a weekend/holiday

      if (otherCriticalIds.length === 0) {
        warnings.push({
          date,
          type: "critical_role",
          message: `You are the only critical-role holder on your team — no one else can cover ${date}.`,
        });
        continue;
      }
      const unavailable = unavailableOtherByDate.get(date) ?? new Set<string>();
      const someoneElseAvailable = otherCriticalIds.some((id) => !unavailable.has(id));
      if (!someoneElseAvailable) {
        warnings.push({
          date,
          type: "critical_role",
          message: `No other critical-role holder is available on ${date} — approving would leave the team without coverage.`,
        });
      }
    }
  }

  return warnings;
}
