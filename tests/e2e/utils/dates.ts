// Date helpers for leave/WFH tests. Must stay in sync with the app's own
// weekend/holiday exclusion (src/lib/working-days.ts) — duplicated here rather
// than imported so these tests exercise the same *behaviour* independently.
const HOLIDAYS = new Set(["2026-07-17"]);

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/**
 * A contiguous `count`-working-day range (Mon–Fri block, no weekend/holiday
 * gaps), starting at least `minOffsetDays` from today so it never lands in
 * the past. Retries a week later if the block would cross the one hardcoded
 * holiday, so this stays correct no matter what date the suite actually runs.
 */
export function pickWorkdayRange(count: number, minOffsetDays = 3): { from: string; to: string } {
  if (count < 1 || count > 5) throw new Error("pickWorkdayRange only supports 1–5 (a single Mon–Fri block).");

  const start = new Date();
  start.setDate(start.getDate() + minOffsetDays);
  // Advance to the next Monday.
  while (start.getDay() !== 1) start.setDate(start.getDate() + 1);

  for (let attempt = 0; attempt < 8; attempt++) {
    const from = new Date(start);
    from.setDate(from.getDate() + attempt * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + count - 1);

    let clean = true;
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (isWeekend(d) || HOLIDAYS.has(iso(d))) clean = false;
    }
    if (clean) return { from: iso(from), to: iso(to) };
  }
  throw new Error("Could not find a clean workday range — check the HOLIDAYS set.");
}

/** A single ISO date guaranteed to be a weekday and not the hardcoded holiday. */
export function pickWorkday(minOffsetDays = 3): string {
  return pickWorkdayRange(1, minOffsetDays).from;
}

/**
 * A calendar-day range (starting on a Monday) that contains exactly
 * `desiredWorkdays` weekdays once weekends/the hardcoded holiday are excluded —
 * i.e. it may span several weeks. Used for over-balance/LOP tests where the
 * request needs to exceed a leave type's max balance (e.g. > 12 working days).
 */
export function pickRangeWithWorkdays(desiredWorkdays: number, minOffsetDays = 3): { from: string; to: string } {
  const start = new Date();
  start.setDate(start.getDate() + minOffsetDays);
  while (start.getDay() !== 1) start.setDate(start.getDate() + 1);

  let counted = 0;
  const cur = new Date(start);
  while (counted < desiredWorkdays) {
    if (!isWeekend(cur) && !HOLIDAYS.has(iso(cur))) counted++;
    if (counted < desiredWorkdays) cur.setDate(cur.getDate() + 1);
  }
  return { from: iso(start), to: iso(cur) };
}
