import "server-only";
// Team calendar: leave / WFH / holiday events for the current month, built from
// real DB data. Scope follows the reporting line — managers see their reports,
// HR/admin see the whole org. `buildCalendar` stays pure + deterministic.
import { and, eq, gte, inArray, lte, notInArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { approvals, holidays as holidaysTable, leaveRequests, leaveTypes, users, type User } from "@/db/schema";
import { currentFy, todayISO } from "@/lib/fy";

export type EventKind = "leave" | "wfh";

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  pending_l1: "Pending L1",
  pending_l2: "Pending L2",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export type EventApproval = {
  level: 1 | 2;
  approverName: string;
  decision: "approved" | "rejected";
  reason: string | null;
  createdAt: string; // ISO timestamp
};

export type CalendarEvent = {
  id: string; // leave_requests.id — stable key for the detail view
  kind: EventKind;
  label: string; // short in-cell label, e.g. "Kabir · WFH"
  employeeName: string;
  typeLabel: string; // "Work from home" | "Casual Leave" | ...
  from: string;
  to: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: string; // raw enum value
  statusLabel: string;
  teamLeadName: string | null;
  projectManagerName: string | null;
  approvals: EventApproval[];
};

export type DayCell = {
  day: number;
  inMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isToday: boolean;
  holidayName: string;
  events: CalendarEvent[];
};

export type CalWeek = { days: DayCell[] };

type BuildInput = {
  year: number;
  month0: number; // 0-based month
  today: string; // ISO yyyy-mm-dd
  events: Record<string, CalendarEvent[]>;
  holidays: Record<string, string>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function nextISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Build a fixed-grid month (always full weeks). Pure + deterministic. */
export function buildCalendar(input: BuildInput): CalWeek[] {
  const { year, month0, today, events, holidays } = input;
  const mm = pad(month0 + 1);
  const first = new Date(year, month0, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const prevDays = new Date(year, month0, 0).getDate();

  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ day: prevDays - startDow + 1 + i, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - (startDow + daysInMonth) + 1, inMonth: false });

  const weeks: CalWeek[] = [];
  for (let w = 0; w < cells.length / 7; w++) {
    const days = cells.slice(w * 7, w * 7 + 7).map<DayCell>((c) => {
      const iso = `${year}-${mm}-${pad(c.day)}`;
      const dow = c.inMonth ? new Date(year, month0, c.day).getDay() : -1;
      const isHoliday = c.inMonth && !!holidays[iso];
      return {
        day: c.day,
        inMonth: c.inMonth,
        isWeekend: c.inMonth && (dow === 0 || dow === 6),
        isHoliday,
        isToday: c.inMonth && iso === today,
        holidayName: isHoliday ? holidays[iso] : "",
        events: c.inMonth ? (events[iso] ?? []) : [],
      };
    });
    weeks.push({ days });
  }
  return weeks;
}

export type CalendarView = {
  weeks: CalWeek[];
  monthLabel: string;
  /** `YYYY-MM` for the adjacent month, or null when at the FY boundary. */
  prevMonth: string | null;
  nextMonth: string | null;
  /** `YYYY-MM` of the real current month (for a "This month" jump), null when already viewing it. */
  thisMonth: string | null;
  fyLabel: string;
};

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

/**
 * Real team calendar, scoped to the viewer's role. `monthParam` (`YYYY-MM`) selects
 * the month; it is clamped to the current financial year (1 Apr – 31 Mar) and
 * defaults to the current month. Navigation targets are bounded to that FY.
 */
export async function getTeamCalendar(user: User, monthParam?: string): Promise<CalendarView> {
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

  // Requested month, clamped into the FY; fall back to the current month.
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

  // Managers see their direct reports; HR/admin see the whole org.
  const isApprover = user.role === "team_lead" || user.role === "project_manager";
  const scopeFilter = isApprover
    ? or(eq(users.teamLeadId, user.id), eq(users.projectManagerId, user.id))
    : undefined;

  const tl = alias(users, "team_lead");
  const pm = alias(users, "project_manager");

  const rows = await db
    .select({
      id: leaveRequests.id,
      name: users.name,
      kind: leaveRequests.kind,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
      halfDay: leaveRequests.halfDay,
      days: leaveRequests.workingDays,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      code: leaveTypes.code,
      typeName: leaveTypes.name,
      teamLeadName: tl.name,
      projectManagerName: pm.name,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .leftJoin(tl, eq(leaveRequests.teamLeadId, tl.id))
    .leftJoin(pm, eq(leaveRequests.projectManagerId, pm.id))
    .where(
      and(
        lte(leaveRequests.fromDate, monthEnd),
        gte(leaveRequests.toDate, monthStart),
        notInArray(leaveRequests.status, ["rejected", "cancelled"]),
        scopeFilter,
      ),
    );

  const requestIds = rows.map((r) => r.id);
  const approvalRows = requestIds.length
    ? await db
        .select({
          requestId: approvals.requestId,
          level: approvals.level,
          decision: approvals.decision,
          reason: approvals.reason,
          createdAt: approvals.createdAt,
          approverName: users.name,
        })
        .from(approvals)
        .innerJoin(users, eq(approvals.approverId, users.id))
        .where(inArray(approvals.requestId, requestIds))
    : [];
  const approvalsByRequest = new Map<string, EventApproval[]>();
  for (const a of approvalRows) {
    const list = approvalsByRequest.get(a.requestId) ?? [];
    list.push({
      level: a.level as 1 | 2,
      approverName: a.approverName,
      decision: a.decision,
      reason: a.reason,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    });
    approvalsByRequest.set(a.requestId, list);
  }

  const events: BuildInput["events"] = {};
  for (const r of rows) {
    const first = r.name.split(" ")[0];
    const code = r.kind === "wfh" ? "WFH" : (r.code ?? "Leave");
    const event: CalendarEvent = {
      id: r.id,
      kind: r.kind,
      label: `${first} · ${code}`,
      employeeName: r.name,
      typeLabel: r.kind === "wfh" ? "Work from home" : (r.typeName ?? "Leave"),
      from: r.from,
      to: r.to,
      halfDay: r.halfDay,
      days: Number(r.days),
      reason: r.reason,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status] ?? r.status,
      teamLeadName: r.teamLeadName,
      projectManagerName: r.projectManagerName,
      approvals: (approvalsByRequest.get(r.id) ?? []).sort((a, b) => a.level - b.level),
    };
    let d = r.from < monthStart ? monthStart : r.from;
    const end = r.to > monthEnd ? monthEnd : r.to;
    while (d <= end) {
      (events[d] ??= []).push(event);
      d = nextISO(d);
    }
  }

  const holRows = await db
    .select({ date: holidaysTable.date, name: holidaysTable.name })
    .from(holidaysTable)
    .where(and(gte(holidaysTable.date, monthStart), lte(holidaysTable.date, monthEnd)));
  const holidayMap: Record<string, string> = {};
  for (const h of holRows) holidayMap[h.date] = h.name;

  const monthLabel = new Date(year, month0, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return {
    weeks: buildCalendar({ year, month0, today, events, holidays: holidayMap }),
    monthLabel,
    prevMonth,
    nextMonth,
    thisMonth,
    fyLabel: fy.label,
  };
}
