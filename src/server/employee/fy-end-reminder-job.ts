import "server-only";
// KAN-160: the scheduled job behind the Remaining Benefit Reminder's
// email channel (the dashboard banner, src/server/employee/reminder-banner.ts,
// is unrelated/already live — this is the emailEnabled fan-out that was still
// a follow-up). Triggered by the Vercel Cron route at
// src/app/api/cron/fy-end-reminder/route.ts, once a day.
//
// `leadDaysBeforeFyEnd` (HR-configured checkpoint days, e.g. [90, 60, 30, 7])
// defines the reminder WINDOW — its largest value is "how many days before
// FY-end reminders can start". `frequency` then governs cadence once inside
// that window:
//   - "once"   — fires on any one of the exact configured checkpoint days;
//                notifyFyEndReminder's own dedup (no date in the subject)
//                guarantees only the first one actually sends.
//   - "weekly" — fires every 7 days once inside the window.
//   - "daily"  — fires every day, but only in the final week (matches the
//                "Daily · final week" label in FREQUENCY_OPTIONS).
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getCategoryBalances } from "@/server/employee/balances";
import { loadReminderSettings } from "@/server/hr/reminder-settings";
import { fyBounds } from "@/lib/fy";
import { notifyFyEndReminder } from "./fy-end-reminder";

function daysLeftInFy(now: Date): { daysLeft: number; fyLabel: string } {
  const iso = now.toISOString().slice(0, 10);
  const fy = fyBounds(iso);
  const daysLeft = Math.max(
    0,
    Math.round((new Date(`${fy.end}T00:00:00Z`).getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000),
  );
  return { daysLeft, fyLabel: fy.label };
}

function isReminderDay(leadDaysBeforeFyEnd: number[], frequency: string, daysLeft: number): boolean {
  if (leadDaysBeforeFyEnd.length === 0) return false;
  const maxLead = Math.max(...leadDaysBeforeFyEnd);
  if (daysLeft > maxLead) return false; // not yet inside the reminder window
  if (frequency === "once") return leadDaysBeforeFyEnd.includes(daysLeft);
  if (frequency === "daily") return daysLeft <= 7;
  return daysLeft % 7 === 0; // weekly cadence once inside the window
}

type ReminderItem = { userId: string; category: string };

export type FyEndReminderJobResult = {
  date: string;
  /** False when today isn't a configured reminder day (or emailEnabled is off) — no employees were even checked. */
  reminderDay: boolean;
  succeeded: ReminderItem[];
  failed: (ReminderItem & { error: string })[];
};

export async function runFyEndReminderJob(now: Date = new Date()): Promise<FyEndReminderJobResult> {
  const date = now.toISOString().slice(0, 10);
  const settings = await loadReminderSettings();
  const { daysLeft, fyLabel } = daysLeftInFy(now);

  if (!settings.emailEnabled || !isReminderDay(settings.leadDaysBeforeFyEnd, settings.frequency, daysLeft)) {
    return { date, reminderDay: false, succeeded: [], failed: [] };
  }

  const db = getDb();
  const employees = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);

  const items: ReminderItem[] = [];
  const tasks: Promise<void>[] = [];
  for (const employee of employees) {
    const balances = await getCategoryBalances(employee.id, fyLabel);
    for (const balance of balances) {
      if (balance.availablePaise <= settings.thresholdPaise) continue;
      items.push({ userId: employee.id, category: balance.key });
      tasks.push(notifyFyEndReminder(employee, balance, fyLabel, settings.frequency, now));
    }
  }

  const results = await Promise.allSettled(tasks);
  const succeeded: ReminderItem[] = [];
  const failed: FyEndReminderJobResult["failed"] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") succeeded.push(items[i]);
    else failed.push({ ...items[i], error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });

  return { date, reminderDay: true, succeeded, failed };
}
