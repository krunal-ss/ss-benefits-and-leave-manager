// KAN-80: pure CSV-building step for the availability export — deliberately
// has NO DB access and imports nothing at runtime from availability.ts (only
// its type), same pattern as capacity-forecast-shape.ts. This is what makes
// `buildAvailabilityCsv` unit-testable with plain fixtures instead of a live
// DB — importing availability.ts's runtime code would pull in its
// `import "server-only"` guard and blow up outside an RSC context.
import type { RangeDayAvailability } from "./availability";

/** Escape one CSV field per RFC 4180 (quote when it holds a comma, quote, or newline). Mirrors src/server/hr/reimbursement.ts's csvField. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Half-day leave produces fractional counts (e.g. 0.5) — one decimal only when needed, matching the heatmap's own formatCount (availability-format.ts). */
function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const CSV_HEADERS = ["Date", "Headcount", "On Leave", "WFH", "Available", "Available %"] as const;

/**
 * Build the availability export CSV — one row per day in `days`, using the
 * exact same figures the heatmap/department overview render
 * (getAvailabilityForRange's output), so the export always matches the
 * currently applied filters (they're baked into `days` by the caller having
 * already passed them to getAvailabilityForRange). "Available %" is left
 * blank on a non-working day / zero-headcount day, matching the UI's null
 * handling.
 */
export function buildAvailabilityCsv(days: RangeDayAvailability[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(csvField).join(","));
  for (const d of days) {
    lines.push(
      [
        csvField(d.date),
        csvField(d.headcount),
        csvField(formatCount(d.onLeave)),
        csvField(d.onWfh),
        csvField(formatCount(d.availableCount)),
        csvField(d.availablePct === null ? "" : d.availablePct),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}
