import "server-only";
// KAN-75: team availability heatmap (manager view) — an aggregate CAPACITY view,
// distinct from the day-by-day event calendar in src/server/calendar.ts. Same
// DB-driven approach (leaveRequests + holidays, reporting-line scoping) but the
// output is a per-day % available for a manager's direct reports rather than a
// list of events.
//
// Business rules (per KAN-75):
//  - "Team" = a manager's direct reports via users.teamLeadId/projectManagerId
//    (there is no normalized team table — reporting lines are DATA).
//  - Weekends + configured holidays are excluded from the % available calc
//    (denominator is only computed for working days).
//  - A half-day leave request counts as 50% unavailable for that day.
//  - WFH counts as AVAILABLE, not unavailable (the person is working, just remote).
//  - Team Lead / Project Manager can only ever view their own reports (ownership).
//    HR Head / Admin may pass `teamId` (a manager's user id) to view any team;
//    with no `teamId` they get a deterministic default (the first manager by name).
import { and, asc, eq, gte, inArray, lte, notInArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { holidays as holidaysTable, leaveRequests, users, type User } from "@/db/schema";
import { currentFy, todayISO } from "@/lib/fy";

export type AvailabilityDay = {
  date: string; // ISO yyyy-mm-dd
  day: number;
  inMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string;
  isToday: boolean;
  headcount: number;
  /** Unavailable units from leave (approved or pending); half-day = 0.5. */
  onLeave: number;
  /** Count of reports with any WFH that day — available, shown for context only. */
  onWfh: number;
  /** headcount - onLeave, floored at 0. WFH does not reduce this. */
  availableCount: number;
  /** Rounded 0-100, or null when not a working day / no headcount (excluded from the calc). */
  availablePct: number | null;
};

export type AvailabilityWeek = { days: AvailabilityDay[] };

export type TeamOption = { id: string; name: string };

export type TeamAvailabilityView = {
  weeks: AvailabilityWeek[];
  /** `YYYY-MM` actually rendered (after FY clamping/defaulting) — for building nav/team-switch links. */
  month: string;
  monthLabel: string;
  /** `YYYY-MM` for the adjacent month, or null when at the FY boundary. */
  prevMonth: string | null;
  nextMonth: string | null;
  /** `YYYY-MM` of the real current month (for a "This month" jump), null when already viewing it. */
  thisMonth: string | null;
  fyLabel: string;
  /** Number of direct reports in the viewed team. */
  headcount: number;
  /** The manager (Team Lead/Project Manager) this view is scoped to; "" when headcount is 0 and no manager could be resolved. */
  teamId: string;
  teamName: string;
  /** Other teams the viewer may switch to (HR Head/Admin only; empty for TL/PM). */
  teams: TeamOption[];
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function nextISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function ymOf(year: number, month0: number): string {
  return `${year}-${pad(month0 + 1)}`;
}
/** Parse a `YYYY-MM` param to a {year, month0}, or null if malformed. */
function parseYearMonth(s: string | undefined): { year: number; month0: number } | null {
  const m = s ? /^(\d{4})-(\d{2})$/.exec(s) : null;
  if (!m) return null;
  const year = Number(m[1]);
  const month0 = Number(m[2]) - 1;
  return month0 >= 0 && month0 <= 11 ? { year, month0 } : null;
}

const MANAGER_ROLES = ["team_lead", "project_manager"] as const;

/** Managers HR Head/Admin can switch the heatmap between, sorted by name. */
async function listTeamOptions(): Promise<TeamOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.role, [...MANAGER_ROLES]))
    .orderBy(asc(users.name));
  return rows;
}

/**
 * Real team-availability heatmap, scoped to the viewer's role. `monthParam`
 * (`YYYY-MM`) selects the month, clamped to the current financial year like
 * the team calendar. `teamId` (a manager's user id) is honoured only for
 * HR Head/Admin — a Team Lead/Project Manager always sees their own reports
 * regardless of what's passed, enforcing ownership server-side.
 */
export async function getTeamAvailability(
  user: User,
  monthParam?: string,
  teamId?: string,
): Promise<TeamAvailabilityView> {
  const db = getDb();
  const today = todayISO();
  const [todayY, todayM] = today.split("-").map(Number); // month is 1-based

  // FY month range (inclusive), expressed as absolute month indices (year*12 + month0).
  const fy = currentFy();
  const [fsY, fsM] = fy.start.split("-").map(Number);
  const [feY, feM] = fy.end.split("-").map(Number);
  const fyStartIdx = fsY * 12 + (fsM - 1);
  const fyEndIdx = feY * 12 + (feM - 1);
  const thisIdx = todayY * 12 + (todayM - 1);

  const requested = parseYearMonth(monthParam);
  let idx = requested ? requested.year * 12 + requested.month0 : thisIdx;
  if (idx < fyStartIdx || idx > fyEndIdx) idx = thisIdx;
  const year = Math.floor(idx / 12);
  const month0 = idx % 12;
  const month = month0 + 1;

  const prevMonth = idx - 1 >= fyStartIdx ? ymOf(Math.floor((idx - 1) / 12), (idx - 1) % 12) : null;
  const nextMonth = idx + 1 <= fyEndIdx ? ymOf(Math.floor((idx + 1) / 12), (idx + 1) % 12) : null;
  const thisMonth = idx !== thisIdx ? ymOf(todayY, todayM - 1) : null;

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;
  const monthLabel = new Date(year, month0, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const isApprover = user.role === "team_lead" || user.role === "project_manager";
  const isHrOrAdmin = user.role === "hr_head" || user.role === "admin";

  // Resolve which manager's team we're viewing. TL/PM: always themselves
  // (ownership — a manager's own reports, never an arbitrary teamId param).
  let effectiveTeamId = "";
  let teamName = "";
  let teams: TeamOption[] = [];
  if (isApprover) {
    effectiveTeamId = user.id;
    teamName = user.name;
  } else if (isHrOrAdmin) {
    teams = await listTeamOptions();
    const chosen = teamId ? teams.find((t) => t.id === teamId) : undefined;
    const fallback = teams[0];
    const pick = chosen ?? fallback;
    effectiveTeamId = pick?.id ?? "";
    teamName = pick?.name ?? "";
  }
  // Any other role (e.g. employee somehow reaching this function) sees an empty team.

  const emptyView: TeamAvailabilityView = {
    weeks: [],
    month: ymOf(year, month0),
    monthLabel,
    prevMonth,
    nextMonth,
    thisMonth,
    fyLabel: fy.label,
    headcount: 0,
    teamId: effectiveTeamId,
    teamName,
    teams,
  };
  if (!effectiveTeamId) return emptyView;

  const reports = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.teamLeadId, effectiveTeamId), eq(users.projectManagerId, effectiveTeamId)));
  const reportIds = reports.map((r) => r.id);
  const headcount = reportIds.length;

  // Per-day, per-user unavailable/wfh units — keyed by ISO date then userId.
  const dayUserUnit = new Map<string, Map<string, { kind: "leave" | "wfh"; unit: number }>>();

  if (headcount > 0) {
    const rows = await db
      .select({
        userId: leaveRequests.userId,
        kind: leaveRequests.kind,
        from: leaveRequests.fromDate,
        to: leaveRequests.toDate,
        halfDay: leaveRequests.halfDay,
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.userId, reportIds),
          lte(leaveRequests.fromDate, monthEnd),
          gte(leaveRequests.toDate, monthStart),
          notInArray(leaveRequests.status, ["rejected", "cancelled"]),
        ),
      );

    for (const r of rows) {
      const unit = r.halfDay ? 0.5 : 1;
      let d = r.from < monthStart ? monthStart : r.from;
      const end = r.to > monthEnd ? monthEnd : r.to;
      while (d <= end) {
        const byUser = dayUserUnit.get(d) ?? new Map();
        const existing = byUser.get(r.userId);
        // If a person somehow has overlapping requests the same day, leave
        // (unavailable) takes precedence over WFH, and we keep the larger unit.
        if (!existing || (r.kind === "leave" && existing.kind !== "leave") || (r.kind === existing.kind && unit > existing.unit)) {
          byUser.set(r.userId, { kind: r.kind, unit });
        }
        dayUserUnit.set(d, byUser);
        d = nextISO(d);
      }
    }
  }

  const holRows = await db
    .select({ date: holidaysTable.date, name: holidaysTable.name })
    .from(holidaysTable)
    .where(and(gte(holidaysTable.date, monthStart), lte(holidaysTable.date, monthEnd)));
  const holidayMap: Record<string, string> = {};
  for (const h of holRows) holidayMap[h.date] = h.name;

  const first = new Date(year, month0, 1);
  const startDow = first.getDay();
  const prevDays = new Date(year, month0, 0).getDate();

  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: prevDays - startDow + 1 + i, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - (startDow + daysInMonth) + 1, inMonth: false });

  const weeks: AvailabilityWeek[] = [];
  for (let w = 0; w < cells.length / 7; w++) {
    const days = cells.slice(w * 7, w * 7 + 7).map<AvailabilityDay>((c) => {
      const iso = `${year}-${pad(month)}-${pad(c.day)}`;
      const dow = c.inMonth ? new Date(year, month0, c.day).getDay() : -1;
      const isHoliday = c.inMonth && !!holidayMap[iso];
      const isWeekend = c.inMonth && (dow === 0 || dow === 6);

      const byUser = c.inMonth ? dayUserUnit.get(iso) : undefined;
      let onLeave = 0;
      let onWfh = 0;
      if (byUser) {
        for (const { kind, unit } of byUser.values()) {
          if (kind === "leave") onLeave += unit;
          else onWfh += 1;
        }
      }
      const availableCount = Math.max(0, headcount - onLeave);
      const isWorkingDay = c.inMonth && !isWeekend && !isHoliday && headcount > 0;
      const availablePct = isWorkingDay ? Math.round((availableCount / headcount) * 100) : null;

      return {
        date: iso,
        day: c.day,
        inMonth: c.inMonth,
        isWeekend,
        isHoliday,
        holidayName: isHoliday ? holidayMap[iso] : "",
        isToday: c.inMonth && iso === today,
        headcount: c.inMonth ? headcount : 0,
        onLeave,
        onWfh,
        availableCount,
        availablePct,
      };
    });
    weeks.push({ days });
  }

  return {
    weeks,
    month: ymOf(year, month0),
    monthLabel,
    prevMonth,
    nextMonth,
    thisMonth,
    fyLabel: fy.label,
    headcount,
    teamId: effectiveTeamId,
    teamName,
    teams,
  };
}
