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
import type { AppRole } from "@/server/auth/rbac";
import { clipDateRange } from "./availability-shape";

// KAN-80: filters shared by the heatmap, the HR department overview, and their
// CSV export. All optional so omitting them preserves the exact pre-KAN-80
// behavior of every existing caller.
export type AvailabilityFilters = {
  /** Narrows which of the resolved member ids are included, by users.role. */
  role?: AppRole;
  /** Only requests of this leave type count as "on leave" for the calc (WFH always has a null leaveTypeId, so it's excluded whenever this is set). */
  leaveTypeId?: string;
  /** Inclusive date-range bounds, independent of the heatmap's month-nav. */
  fromDate?: string;
  toDate?: string;
};

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
/** ISO yyyy-mm-dd for the calendar day after `iso`. Exported for callers that
 * walk an arbitrary date range (e.g. the KAN-77 staffing guard). */
export function nextISO(iso: string): string {
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

/** Managers HR Head/Admin can switch the heatmap between, sorted by name. Also
 * reused by the KAN-79 daily snapshot job to enumerate every team scope. */
export async function listTeamOptions(): Promise<TeamOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.role, [...MANAGER_ROLES]))
    .orderBy(asc(users.name));
  return rows;
}

export type RangeDayAvailability = {
  date: string; // ISO yyyy-mm-dd
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string;
  isWorkingDay: boolean;
  headcount: number;
  /** Unavailable units from leave (approved OR pending); half-day = 0.5. */
  onLeave: number;
  /** Unavailable units from APPROVED leave only (a subset of `onLeave`) — KAN-79. */
  onLeaveApproved: number;
  /** Count of reports with any WFH that day — available, shown for context only. */
  onWfh: number;
  /** headcount - onLeave, floored at 0. WFH does not reduce this. */
  availableCount: number;
  /** Rounded 0-100, or null when not a working day / no headcount. */
  availablePct: number | null;
  /** headcount - onLeaveApproved, floored at 0 — the "confirmed" figure, ignoring pending requests (KAN-79). */
  availableCountApproved: number;
  /** Rounded 0-100 confirmed-only figure, or null when not a working day / no headcount (KAN-79). */
  availablePctApproved: number | null;
};

type DayUserUnit = { kind: "leave" | "wfh"; unit: number };

/**
 * Reduce a set of (possibly overlapping) leave/WFH rows into one winning
 * per-user-per-day entry: leave takes precedence over WFH, and the larger
 * unit wins when the same kind overlaps twice for the same user/day. Shared
 * by the combined (approved+pending) and approved-only passes in
 * `getAvailabilityForRange` so the precedence rule lives in exactly one
 * place.
 */
function buildDayUserUnitMap(
  rows: { userId: string; kind: "leave" | "wfh"; from: string; to: string; halfDay: boolean }[],
  fromDate: string,
  toDate: string,
): Map<string, Map<string, DayUserUnit>> {
  const dayUserUnit = new Map<string, Map<string, DayUserUnit>>();
  for (const r of rows) {
    const unit = r.halfDay ? 0.5 : 1;
    let d = r.from < fromDate ? fromDate : r.from;
    const end = r.to > toDate ? toDate : r.to;
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
  return dayUserUnit;
}

function sumLeaveUnits(byUser: Map<string, DayUserUnit> | undefined): { onLeave: number; onWfh: number } {
  let onLeave = 0;
  let onWfh = 0;
  if (byUser) {
    for (const { kind, unit } of byUser.values()) {
      if (kind === "leave") onLeave += unit;
      else onWfh += 1;
    }
  }
  return { onLeave, onWfh };
}

/**
 * Per-day availability for an arbitrary inclusive date range — the same
 * business rules as `getTeamAvailability` (weekends/holidays excluded,
 * half-day leave = 50% unavailable, WFH counts as available), but shaped for
 * a plain `[fromDate, toDate]` window instead of a calendar-month grid.
 * `reportIds` is resolved by the caller (a manager's direct reports, or any
 * other set of user ids that define the "team" being checked). Both
 * `getTeamAvailability` (per-month) and the KAN-77 staffing guard (arbitrary
 * request ranges) build on this single day-level calculation.
 *
 * KAN-79: also splits out an APPROVED-only figure (`onLeaveApproved` /
 * `availableCountApproved` / `availablePctApproved`) alongside the existing
 * combined approved+pending figures, so the capacity forecast can show a
 * "confirmed" series distinct from an "at-risk if pending gets approved"
 * series without a second day-loop.
 *
 * KAN-80: `leaveTypeId`, when passed, restricts which requests count as "on
 * leave" to that one leave type — this also excludes every WFH row (WFH
 * always has a null leaveTypeId), which is the desired behavior when a
 * viewer filters the heatmap/export down to one leave type. Omitting it
 * preserves the exact pre-KAN-80 (all leave types + WFH) behavior for every
 * existing caller.
 */
export async function getAvailabilityForRange(
  reportIds: string[],
  fromDate: string,
  toDate: string,
  leaveTypeId?: string,
): Promise<RangeDayAvailability[]> {
  const db = getDb();
  const headcount = reportIds.length;
  if (fromDate > toDate) return [];

  let dayUserUnitAll = new Map<string, Map<string, DayUserUnit>>();
  let dayUserUnitApproved = new Map<string, Map<string, DayUserUnit>>();
  if (headcount > 0) {
    const rows = await db
      .select({
        userId: leaveRequests.userId,
        kind: leaveRequests.kind,
        from: leaveRequests.fromDate,
        to: leaveRequests.toDate,
        halfDay: leaveRequests.halfDay,
        status: leaveRequests.status,
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.userId, reportIds),
          lte(leaveRequests.fromDate, toDate),
          gte(leaveRequests.toDate, fromDate),
          notInArray(leaveRequests.status, ["rejected", "cancelled"]),
          ...(leaveTypeId ? [eq(leaveRequests.leaveTypeId, leaveTypeId)] : []),
        ),
      );

    dayUserUnitAll = buildDayUserUnitMap(rows, fromDate, toDate);
    dayUserUnitApproved = buildDayUserUnitMap(
      // KAN-127 — a pending cancellation isn't final yet; still counts as confirmed unavailable.
      rows.filter((r) => r.status === "approved" || r.status === "cancellation_requested"),
      fromDate,
      toDate,
    );
  }

  const holRows = await db
    .select({ date: holidaysTable.date, name: holidaysTable.name })
    .from(holidaysTable)
    .where(and(gte(holidaysTable.date, fromDate), lte(holidaysTable.date, toDate)));
  const holidayMap: Record<string, string> = {};
  for (const h of holRows) holidayMap[h.date] = h.name;

  const days: RangeDayAvailability[] = [];
  let d = fromDate;
  while (d <= toDate) {
    const [y, m, day] = d.split("-").map(Number);
    const dow = new Date(y, m - 1, day).getDay();
    const isHoliday = !!holidayMap[d];
    const isWeekend = dow === 0 || dow === 6;

    const { onLeave, onWfh } = sumLeaveUnits(dayUserUnitAll.get(d));
    const { onLeave: onLeaveApproved } = sumLeaveUnits(dayUserUnitApproved.get(d));

    const availableCount = Math.max(0, headcount - onLeave);
    const availableCountApproved = Math.max(0, headcount - onLeaveApproved);
    const isWorkingDay = !isWeekend && !isHoliday && headcount > 0;
    const availablePct = isWorkingDay ? Math.round((availableCount / headcount) * 100) : null;
    const availablePctApproved = isWorkingDay ? Math.round((availableCountApproved / headcount) * 100) : null;

    days.push({
      date: d,
      isWeekend,
      isHoliday,
      holidayName: isHoliday ? holidayMap[d] : "",
      isWorkingDay,
      headcount,
      onLeave,
      onLeaveApproved,
      onWfh,
      availableCount,
      availablePct,
      availableCountApproved,
      availablePctApproved,
    });
    d = nextISO(d);
  }

  return days;
}

export type TeamScope = {
  /** The manager (Team Lead/Project Manager) this scope resolves to; "" when none could be resolved. */
  teamId: string;
  teamName: string;
  /** Other teams the viewer may switch to (HR Head/Admin only; empty for TL/PM). */
  teams: TeamOption[];
  reportIds: string[];
  headcount: number;
};

/**
 * Resolve which manager's "team" a viewer may see — the single ownership
 * rule shared by every capacity view (the KAN-75 heatmap, the KAN-79
 * forecast, and future ones): a Team Lead/Project Manager always sees their
 * own direct reports (the `teamId` param is ignored for them, enforcing
 * ownership server-side); HR Head/Admin may pass `teamId` to view any team,
 * defaulting deterministically (first manager by name) when omitted. Any
 * other role resolves to an empty scope.
 *
 * KAN-80: `roleFilter`, when passed, narrows the resolved reports to only
 * those with that `users.role` — applied after ownership is resolved, so it
 * can only ever shrink a viewer's own already-authorized scope, never widen
 * it. Omitting it preserves the exact pre-KAN-80 behavior.
 */
export async function resolveTeamScope(user: User, teamId?: string, roleFilter?: AppRole): Promise<TeamScope> {
  const db = getDb();
  const isApprover = user.role === "team_lead" || user.role === "project_manager";
  const isHrOrAdmin = user.role === "hr_head" || user.role === "admin";

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

  if (!effectiveTeamId) return { teamId: "", teamName, teams, reportIds: [], headcount: 0 };

  const reportLineFilter = or(eq(users.teamLeadId, effectiveTeamId), eq(users.projectManagerId, effectiveTeamId));
  const reports = await db
    .select({ id: users.id })
    .from(users)
    .where(roleFilter ? and(reportLineFilter, eq(users.role, roleFilter)) : reportLineFilter);
  const reportIds = reports.map((r) => r.id);
  return { teamId: effectiveTeamId, teamName, teams, reportIds, headcount: reportIds.length };
}

/**
 * Real team-availability heatmap, scoped to the viewer's role. `monthParam`
 * (`YYYY-MM`) selects the month, clamped to the current financial year like
 * the team calendar. `teamId` (a manager's user id) is honoured only for
 * HR Head/Admin — a Team Lead/Project Manager always sees their own reports
 * regardless of what's passed, enforcing ownership server-side.
 *
 * KAN-80: an optional `filters` narrows the grid — `role` narrows team
 * membership (via `resolveTeamScope`), `leaveTypeId` restricts which requests
 * count as "on leave" (via `getAvailabilityForRange`), and `fromDate`/`toDate`
 * clip the fetched range to their intersection with the viewed month (days
 * outside that intersection render blank, same as an out-of-month cell).
 * Omitting `filters` preserves the exact pre-KAN-80 behavior.
 */
export async function getTeamAvailability(
  user: User,
  monthParam?: string,
  teamId?: string,
  filters?: AvailabilityFilters,
): Promise<TeamAvailabilityView> {
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

  // Resolve which manager's team we're viewing — same ownership rule
  // everywhere (TL/PM: always themselves; HR/Admin: any team via `teamId`).
  const { teamId: effectiveTeamId, teamName, teams, reportIds, headcount } = await resolveTeamScope(
    user,
    teamId,
    filters?.role,
  );

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

  // The day-level calc (weekend/holiday exclusion, half-day=50%, WFH=available)
  // lives once in getAvailabilityForRange — this just maps its per-date output
  // onto the calendar-month grid this view renders. KAN-80: a fromDate/toDate
  // filter clips the fetched window to its intersection with the viewed
  // month — days outside it simply have no entry in rangeByDate below, and
  // render blank the same way an out-of-month cell already does.
  const { from: rangeFrom, to: rangeTo } = clipDateRange(monthStart, monthEnd, filters?.fromDate, filters?.toDate);
  const rangeDays = await getAvailabilityForRange(reportIds, rangeFrom, rangeTo, filters?.leaveTypeId);
  const rangeByDate = new Map(rangeDays.map((d) => [d.date, d]));

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
      const info = c.inMonth ? rangeByDate.get(iso) : undefined;

      return {
        date: iso,
        day: c.day,
        inMonth: c.inMonth,
        isWeekend: info?.isWeekend ?? false,
        isHoliday: info?.isHoliday ?? false,
        holidayName: info?.holidayName ?? "",
        isToday: c.inMonth && iso === today,
        headcount: c.inMonth ? headcount : 0,
        onLeave: info?.onLeave ?? 0,
        onWfh: info?.onWfh ?? 0,
        availableCount: info?.availableCount ?? 0,
        availablePct: info?.availablePct ?? null,
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
