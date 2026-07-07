// KAN-168 — Notification Preferences quiet-hours math. Pure, dependency-free
// (importable from both server code and Vitest) so it's trivially unit-tested
// without a DB. Quiet hours are stored/compared as IST wall-clock "HH:MM"
// (this org is India-based — see notificationPreferences in src/db/schema.ts),
// independent of the server's own timezone.

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000; // UTC+5:30, no DST

/** Minutes since IST midnight for a given instant. */
function toIstMinutesOfDay(date: Date): number {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** Parses "HH:MM" (00-23 : 00-59) to minutes-since-midnight, or null if malformed. */
function parseHHMM(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Is `now` inside the [quietHoursStart, quietHoursEnd) IST window? Both bounds
 * must be set and well-formed (either being null/invalid means quiet hours
 * are OFF — no gating). Handles a window that wraps past midnight, e.g.
 * "22:00" -> "07:00" covers 22:00-23:59 AND 00:00-06:59. An equal start/end
 * ("no window") is treated as OFF rather than "always on".
 */
export function isWithinQuietHours(
  quietHoursStart: string | null | undefined,
  quietHoursEnd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!quietHoursStart || !quietHoursEnd) return false;
  const start = parseHHMM(quietHoursStart);
  const end = parseHHMM(quietHoursEnd);
  if (start === null || end === null || start === end) return false;

  const current = toIstMinutesOfDay(now);
  if (start < end) return current >= start && current < end;
  return current >= start || current < end; // wraps midnight
}
