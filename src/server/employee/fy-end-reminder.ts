import "server-only";
// KAN-160: the actual per-employee FY-end benefit reminder email — Remaining
// Benefit Reminder epic (KAN-148). Reuses the exact subject/HTML shape of the
// manual "Send test to me" preview (src/server/actions/reminder-settings.ts's
// sendReminderTestAction), but this is the real per-employee fan-out the
// comment there flags as a KAN-160 follow-up.
//
// Dedup: emailLog is queried for an existing row with the exact same
// toAddress+subject+template before sending (toAddress is included, unlike
// capacity-alert.ts's scope-wide alert, because two different employees can
// otherwise land on the literal same subject text if their unused balance
// happens to match). The subject's date/period component varies with
// `frequency` so this same dedup mechanism also enforces the cadence:
//   - "once"   — no date component at all, so the very first send for this
//                employee+category+FY blocks every later one (fires exactly
//                once, whichever configured checkpoint is reached first).
//   - "weekly" — the ISO week start is baked into the subject, so one send
//                per employee+category+FY+week.
//   - "daily"  — the exact date is baked in, so one send per calendar day.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog } from "@/db/schema";
import { sendEmail } from "@/server/email";
import type { CategoryBalance } from "@/server/employee/balances";
import { formatINR } from "@/lib/format";
import type { ReminderFrequency } from "@/lib/reminder-constants";

export const FY_END_REMINDER_TEMPLATE = "fy_end_benefit_reminder";

function isoWeekStart(now: Date): string {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function periodSuffix(frequency: ReminderFrequency, now: Date): string {
  if (frequency === "daily") return ` on ${now.toISOString().slice(0, 10)}`;
  if (frequency === "weekly") return ` (week of ${isoWeekStart(now)})`;
  return "";
}

export type ReminderRecipient = { id: string; name: string; email: string };

/**
 * Emails one employee about one category's unused balance. No-op (no email,
 * no emailLog row) when a reminder for this exact employee+category+FY+period
 * was already logged.
 */
export async function notifyFyEndReminder(
  user: ReminderRecipient,
  balance: CategoryBalance,
  fyLabel: string,
  frequency: ReminderFrequency,
  now: Date = new Date(),
): Promise<void> {
  const db = getDb();
  const amount = formatINR(balance.availablePaise / 100);
  const subject = `You have ${amount} in unused ${balance.label} benefits — FY ${fyLabel}${periodSuffix(frequency, now)}`;

  const [existing] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.toAddress, user.email),
        eq(emailLog.subject, subject),
        eq(emailLog.template, FY_END_REMINDER_TEMPLATE),
      ),
    )
    .limit(1);
  if (existing) return;

  const firstName = user.name.split(" ")[0];
  const html = `
    <div style="font-family: sans-serif; font-size: 13px; line-height: 1.55; color: #111;">
      <p>Hi ${firstName},</p>
      <p>Your benefit wallet still has <strong>${amount}</strong> unused in <strong>${balance.label}</strong> for FY ${fyLabel}.
      This balance does not carry over past FY-end — submit your claims before then to make full use of it.</p>
      <p><a href="/submit" style="display:inline-block;padding:8px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none;">Submit a claim</a></p>
      <p style="font-size:11px;color:#888;">Sent by SmartSense People Ops · you can manage reminder settings in the portal.</p>
    </div>
  `;

  try {
    await sendEmail({ to: user.email, subject, html });
    await db.insert(emailLog).values({ toAddress: user.email, subject, template: FY_END_REMINDER_TEMPLATE, status: "sent" });
  } catch {
    await db
      .insert(emailLog)
      .values({ toAddress: user.email, subject, template: FY_END_REMINDER_TEMPLATE, status: "failed" })
      .catch(() => {});
  }
}
