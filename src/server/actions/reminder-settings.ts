"use server";

// KAN-148 — Save the benefit-reminder schedule/channels/audience from the HR
// config screen, and send the manual "Send test to me" preview email. Mirrors
// src/server/actions/staffing-thresholds.ts's shape: zod-validate, requireUser(),
// assertCan(role, "configurePolicy") before any DB write, delegate persistence +
// audit to src/server/hr/reminder-settings.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { emailLog } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { sendEmail } from "@/server/email";
import { getCategoryBalances } from "@/server/employee/balances";
import { getReminderAudienceCount, upsertReminderSettings } from "@/server/hr/reminder-settings";
import { currentFy } from "@/lib/fy";
import { formatINR } from "@/lib/format";
import { LEAD_DAY_OPTIONS } from "@/lib/reminder-constants";

const saveSchema = z.object({
  leadDaysBeforeFyEnd: z
    .array(z.number().refine((d) => (LEAD_DAY_OPTIONS as readonly number[]).includes(d)))
    .max(LEAD_DAY_OPTIONS.length),
  frequency: z.enum(["once", "weekly", "daily"]),
  dashboardEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  // Rupees at the UI boundary — converted to paise before it reaches the server module.
  thresholdRupees: z.number().min(0),
});

export type SaveReminderSettingsResult = { ok: boolean; message: string };

export async function saveReminderSettingsAction(
  input: z.input<typeof saveSchema>,
): Promise<SaveReminderSettingsResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  try {
    assertCan(me.role, "configurePolicy");
    await upsertReminderSettings({
      leadDaysBeforeFyEnd: parsed.data.leadDaysBeforeFyEnd,
      frequency: parsed.data.frequency,
      dashboardEnabled: parsed.data.dashboardEnabled,
      emailEnabled: parsed.data.emailEnabled,
      thresholdPaise: Math.round(parsed.data.thresholdRupees * 100),
      actorId: me.id,
      actorRole: me.role,
    });

    revalidatePath("/reminders");
    return { ok: true, message: "Reminder schedule saved." };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }
}

/**
 * Read-only live preview for the "{N} employees currently qualify" text as HR
 * edits the threshold input, before saving. Gated the same as the save action
 * (defense in depth — the page itself is already requireAccess-gated).
 */
export async function getReminderAudienceCountAction(thresholdRupees: number): Promise<number> {
  const me = await requireUser();
  assertCan(me.role, "configurePolicy");
  const thresholdPaise = Math.max(0, Math.round(thresholdRupees * 100));
  return getReminderAudienceCount(thresholdPaise);
}

const TEST_EMAIL_TEMPLATE = "benefit_reminder_test";

export type SendTestResult = { ok: boolean; message: string };

/**
 * Builds the same preview email the settings screen renders (subject "You
 * have {amount} in unused benefits") using the caller's OWN real balance —
 * independent of the emailEnabled/dashboard toggles, since this is an explicit
 * manual test — and sends it to their own inbox. Never a per-employee
 * fan-out (that cron job is out of scope for this pass, see KAN-160).
 */
export async function sendReminderTestAction(): Promise<SendTestResult> {
  const me = await requireUser();
  try {
    assertCan(me.role, "configurePolicy");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  const fy = currentFy();
  const balances = await getCategoryBalances(me.id, fy.label);
  const totalAvailablePaise = balances.reduce((sum, b) => sum + b.availablePaise, 0);
  const sportsPaise = balances.find((b) => b.key === "sports")?.availablePaise ?? 0;
  const learningPaise = balances.find((b) => b.key === "learning")?.availablePaise ?? 0;
  const firstName = me.name.split(" ")[0];

  const subject = `You have ${formatINR(totalAvailablePaise / 100)} in unused benefits`;
  const html = `
    <div style="font-family: sans-serif; font-size: 13px; line-height: 1.55; color: #111;">
      <p>Hi ${firstName},</p>
      <p>Your benefit wallet still has <strong>${formatINR(totalAvailablePaise / 100)}</strong> unused across
      Sports and Learning. This balance does not carry over past <strong>${fy.end}</strong> — submit your
      claims before then to make full use of it.</p>
      <p>
        <span style="display:inline-block;margin-right:8px;">Sports ${formatINR(sportsPaise / 100)}</span>
        <span style="display:inline-block;">Learning ${formatINR(learningPaise / 100)}</span>
      </p>
      <p><a href="/submit" style="display:inline-block;padding:8px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none;">Submit a claim</a></p>
      <p style="font-size:11px;color:#888;">Sent by SmartSense People Ops · you can manage reminder settings in the portal.</p>
    </div>
  `;

  const db = getDb();
  try {
    await sendEmail({ to: me.email, subject, html });
    await db.insert(emailLog).values({ toAddress: me.email, subject, template: TEST_EMAIL_TEMPLATE, status: "sent" });
    return { ok: true, message: "Test reminder emailed to you." };
  } catch {
    await db
      .insert(emailLog)
      .values({ toAddress: me.email, subject, template: TEST_EMAIL_TEMPLATE, status: "failed" })
      .catch(() => {});
    return { ok: false, message: "Could not send the test email — check the email configuration." };
  }
}
