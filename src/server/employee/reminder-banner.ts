// KAN-148 — Data for the employee dashboard's "unused benefit" reminder
// banner. Reuses getCategoryBalances (src/server/employee/balances.ts) as the
// data source — no new balance computation. Renders nothing (returns null)
// when the HR-configured dashboardEnabled toggle is off, or the employee's
// total unused balance doesn't exceed the configured threshold.
import "server-only";
import { getCategoryBalances } from "@/server/employee/balances";
import { loadReminderSettings } from "@/server/hr/reminder-settings";
import { currentFy, fyBounds, todayISO } from "@/lib/fy";
import { formatDateLong } from "@/lib/format";

export type ReminderBannerData = {
  totalAvailablePaise: number;
  sportsAvailablePaise: number;
  learningAvailablePaise: number;
  daysLeft: number;
  fyEndLabel: string;
};

/** Null when the banner should not render for this employee right now. */
export async function getReminderBannerData(userId: string): Promise<ReminderBannerData | null> {
  const settings = await loadReminderSettings();
  if (!settings.dashboardEnabled) return null;

  const fy = currentFy();
  const balances = await getCategoryBalances(userId, fy.label);
  const totalAvailablePaise = balances.reduce((sum, b) => sum + b.availablePaise, 0);
  if (totalAvailablePaise <= settings.thresholdPaise) return null;

  const { end } = fyBounds(todayISO());
  const daysLeft = Math.max(
    0,
    Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86_400_000),
  );

  return {
    totalAvailablePaise,
    sportsAvailablePaise: balances.find((b) => b.key === "sports")?.availablePaise ?? 0,
    learningAvailablePaise: balances.find((b) => b.key === "learning")?.availablePaise ?? 0,
    daysLeft,
    fyEndLabel: formatDateLong(end),
  };
}
