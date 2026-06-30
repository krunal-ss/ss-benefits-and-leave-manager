import "server-only";
// Team calendar: leave / WFH / holiday events for the current month, built from
// real DB data. Scope follows the reporting line — managers see their reports,
// HR/admin see the whole org. `buildCalendar` stays pure + deterministic.
import { and, eq, gte, lte, notInArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { holidays as holidaysTable, leaveRequests, leaveTypes, users, type User } from "@/db/schema";
import { todayISO } from "@/lib/fy";

export type EventKind = "leave" | "wfh";

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayCell = {
  day: number;
  inMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isToday: boolean;
  holidayName: string;
  events: { kind: EventKind; label: string }[];
};

export type CalWeek = { days: DayCell[] };

type BuildInput = {
  year: number;
  month0: number; // 0-based month
  today: string; // ISO yyyy-mm-dd
  events: Record<string, { kind: EventKind; label: string }[]>;
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

/** Real team calendar for the current month, scoped to the viewer's role. */
export async function getTeamCalendar(user: User): Promise<{ weeks: CalWeek[]; monthLabel: string }> {
  const db = getDb();
  const today = todayISO();
  const [year, month] = today.split("-").map(Number); // month is 1-based here
  const month0 = month - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  // Managers see their direct reports; HR/admin see the whole org.
  const isApprover = user.role === "team_lead" || user.role === "project_manager";
  const scopeFilter = isApprover
    ? or(eq(users.teamLeadId, user.id), eq(users.projectManagerId, user.id))
    : undefined;

  const rows = await db
    .select({
      name: users.name,
      kind: leaveRequests.kind,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
      code: leaveTypes.code,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        lte(leaveRequests.fromDate, monthEnd),
        gte(leaveRequests.toDate, monthStart),
        notInArray(leaveRequests.status, ["rejected", "cancelled"]),
        scopeFilter,
      ),
    );

  const events: BuildInput["events"] = {};
  for (const r of rows) {
    const first = r.name.split(" ")[0];
    const code = r.kind === "wfh" ? "WFH" : (r.code ?? "Leave");
    const label = `${first} · ${code}`;
    let d = r.from < monthStart ? monthStart : r.from;
    const end = r.to > monthEnd ? monthEnd : r.to;
    while (d <= end) {
      (events[d] ??= []).push({ kind: r.kind, label });
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
  return { weeks: buildCalendar({ year, month0, today, events, holidays: holidayMap }), monthLabel };
}
