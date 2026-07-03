// KAN-80: pure date-range shaping for the heatmap's optional filters —
// deliberately has NO DB access, same pattern as capacity-forecast-shape.ts,
// so it's unit-testable without mocking availability.ts's `server-only` guard.

/**
 * Clip `[monthStart, monthEnd]` to its intersection with an optional
 * `[fromFilter, toFilter]` window. All four values are ISO `yyyy-mm-dd`
 * strings, which compare lexicographically the same as chronologically, so
 * plain string comparison is enough. Used by `getTeamAvailability` to narrow
 * which days are fetched/rendered for a date-range filter without changing
 * the calendar-month grid layout itself — days outside the returned range
 * simply have no entry in the caller's per-date map and render blank.
 */
export function clipDateRange(
  monthStart: string,
  monthEnd: string,
  fromFilter?: string,
  toFilter?: string,
): { from: string; to: string } {
  const from = fromFilter && fromFilter > monthStart ? fromFilter : monthStart;
  const to = toFilter && toFilter < monthEnd ? toFilter : monthEnd;
  return { from, to };
}
