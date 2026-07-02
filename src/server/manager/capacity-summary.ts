// KAN-76: capacity summary widget — a pure reshaping step on top of KAN-75's
// getTeamAvailability(). Deliberately has NO DB access and imports nothing
// from availability.ts at runtime (only its types): it just finds the
// matching AvailabilityDay inside the `weeks` grid that service already
// computed and shapes it into the small summary the /availability cards
// render. The capacity math itself (weekday/holiday exclusion, half-day=50%,
// WFH=available) lives exactly once, in availability.ts — this module must
// never recompute it from raw leaveRequests/holidays rows.
import type { AvailabilityDay, AvailabilityWeek } from "./availability";

export type CapacitySummary = {
  /** ISO yyyy-mm-dd. */
  date: string;
  /** False for a weekend/holiday/out-of-month day — no capacity % applies (BR1: exclude weekends/holidays). */
  isWorkingDay: boolean;
  headcount: number;
  /** Rounded 0-100, or null on a non-working day / zero headcount. */
  availablePct: number | null;
  /** Unavailable units from leave (approved or pending); half-day = 0.5. */
  onLeaveCount: number;
  /** Count of reports WFH that day — available, shown for context only. */
  wfhCount: number;
  holidayName: string;
};

function summarizeDay(day: AvailabilityDay): CapacitySummary {
  return {
    date: day.date,
    isWorkingDay: day.inMonth && !day.isWeekend && !day.isHoliday,
    headcount: day.headcount,
    availablePct: day.availablePct,
    onLeaveCount: day.onLeave,
    wfhCount: day.onWfh,
    holidayName: day.holidayName,
  };
}

/**
 * Find `date` (ISO yyyy-mm-dd) among the days `getTeamAvailability` already
 * computed and shape it into a `CapacitySummary`. Returns null when the date
 * isn't present in the supplied weeks (e.g. it belongs to a different month
 * than the one `weeks` was built for).
 */
export function getCapacitySummary(weeks: AvailabilityWeek[], date: string): CapacitySummary | null {
  for (const week of weeks) {
    const day = week.days.find((d) => d.date === date);
    if (day) return summarizeDay(day);
  }
  return null;
}
