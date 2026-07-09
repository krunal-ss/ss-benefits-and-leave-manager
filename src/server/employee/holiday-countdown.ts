// KAN-206 — Public Holiday Countdown. Reads the real `holidays` table
// directly (src/db/schema.ts); does NOT rewire src/lib/working-days.ts's
// hardcoded holiday map — that gap is pre-existing and tracked separately.
import "server-only";
import { and, asc, gte, isNull, or, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { holidays } from "@/db/schema";
import { todayISO } from "@/lib/fy";
import { formatDateLong } from "@/lib/format";

export type HolidayCountdown = {
  name: string;
  dateISO: string;
  dateLabel: string;
  daysUntil: number;
};

/**
 * Next upcoming holiday for this user, or null if none configured. A holiday
 * with a null `location` applies org-wide; one with a location only counts
 * for users at that same location (users.location null → org-wide only).
 */
export async function getNextHoliday(userLocation: string | null): Promise<HolidayCountdown | null> {
  const db = getDb();
  const today = todayISO();

  const locationFilter = userLocation ? or(isNull(holidays.location), eq(holidays.location, userLocation)) : isNull(holidays.location);

  const [next] = await db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, today), locationFilter))
    .orderBy(asc(holidays.date))
    .limit(1);

  if (!next) return null;

  const daysUntil = Math.round(
    (new Date(`${next.date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );

  return { name: next.name, dateISO: next.date, dateLabel: formatDateLong(next.date), daysUntil };
}
