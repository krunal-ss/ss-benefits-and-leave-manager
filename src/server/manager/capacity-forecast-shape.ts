// KAN-79: pure reshaping step for the capacity forecast — deliberately has NO
// DB access and imports nothing at runtime from availability.ts (only its
// type), same pattern as capacity-summary.ts. This is what makes
// `buildForecastPoints` unit-testable with plain fixtures instead of a live
// DB: importing availability.ts's runtime code would pull in its
// `import "server-only"` guard and blow up outside an RSC context.
import type { RangeDayAvailability } from "./availability";

export type ForecastPoint = {
  date: string; // ISO yyyy-mm-dd
  isWorkingDay: boolean;
  headcount: number;
  /** Confirmed (approved-only) available headcount; may be fractional (half-day leave). */
  availableApproved: number;
  /** Rounded 0-100 confirmed-only %, or null on a non-working day / zero headcount. */
  availablePctApproved: number | null;
  /** "At-risk" available headcount if every pending request in range were also approved. */
  availableWithPending: number;
  /** Rounded 0-100 at-risk %, or null on a non-working day / zero headcount. */
  availablePctWithPending: number | null;
  /** Unavailable units from APPROVED leave only. */
  onLeaveApproved: number;
  /** ADDITIONAL unavailable units contributed by PENDING (not yet decided) requests — 0 when there's no pending impact this day. */
  onLeavePending: number;
};

/**
 * Turn the shared day-level calc's output (`getAvailabilityForRange`) into
 * the two confirmed-vs-at-risk series the forecast UI renders. A pending
 * (not-yet-decided) request only ever widens the gap between
 * `availableWithPending`/`onLeavePending` and the confirmed figures — it
 * never touches `availableApproved`/`onLeaveApproved` (KAN-79 AC2).
 */
export function buildForecastPoints(rangeDays: RangeDayAvailability[]): ForecastPoint[] {
  return rangeDays.map((d) => ({
    date: d.date,
    isWorkingDay: d.isWorkingDay,
    headcount: d.headcount,
    availableApproved: d.availableCountApproved,
    availablePctApproved: d.availablePctApproved,
    availableWithPending: d.availableCount,
    availablePctWithPending: d.availablePct,
    onLeaveApproved: d.onLeaveApproved,
    onLeavePending: Math.max(0, d.onLeave - d.onLeaveApproved),
  }));
}
