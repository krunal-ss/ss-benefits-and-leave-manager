// Working-day counting MUST exclude weekends + configured holidays (hard rule).

// Configured org holidays (ISO date → label). In production this is the Holiday table.
export const HOLIDAYS: Record<string, string> = {
  "2026-07-17": "Holiday",
};

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export type WorkingDaysResult = { days: number; skipped: number };

/** Working days between two ISO dates (inclusive), excluding weekends + holidays. */
export function workingDaysBetween(
  fromISO: string,
  toISODate: string,
  halfDay: boolean,
): WorkingDaysResult {
  if (!fromISO || !toISODate) return { days: 0, skipped: 0 };
  const from = parseISO(fromISO);
  const to = parseISO(toISODate);
  if (to < from) return { days: 0, skipped: 0 };
  if (halfDay) return { days: 0.5, skipped: 0 };

  let days = 0;
  let skipped = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;
    if (isWeekend || HOLIDAYS[toISO(cur)]) skipped++;
    else days++;
    cur.setDate(cur.getDate() + 1);
  }
  return { days, skipped };
}
