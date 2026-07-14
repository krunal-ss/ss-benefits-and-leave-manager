// KAN-168 — Notification Preferences (Employee Productivity Enhancements
// epic, KAN-165). PER-USER settings row (unlike the single global-row config
// tables elsewhere, e.g. approvalPolicy/benefitReminderSettings) — every read
// here is keyed off a `userId`, lazily creating the default row (all channels
// on, no quiet hours) on first access, same "lazy default" shape as
// src/server/hr/reminder-settings.ts's loadReminderSettings.
//
// server-only: never import this from a Client Component. The mutating half
// (updateNotificationPreferencesAction) lives in
// src/server/actions/notification-preferences.ts as a "use server" Server
// Action, mirroring this repo's actions/ vs. domain-service split (see
// reminder-settings.ts's two files) — kept OUT of this file specifically so
// that getNotificationPreferences/isNotificationAllowed (which both take an
// arbitrary `userId`) can never accidentally become client-callable RPCs by a
// file-level "use server" directive.
//
// SCOPE — only the "email" channel has a real delivery path today.
// `pushEnabled`/`inAppEnabled` are recorded preferences with NO delivery
// mechanism behind them yet (no web-push/service worker/VAPID keys, no
// in-app notification center) — see isNotificationAllowed below.
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationPreferences, type NotificationPreferencesRow } from "@/db/schema";
import { isWithinQuietHours } from "@/lib/quiet-hours";

export type { NotificationPreferencesRow };

/**
 * The caller's notification-preferences row, lazily created with defaults on
 * first read (every user implicitly starts with all channels on, no quiet
 * hours) — never throws in the request path.
 */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferencesRow> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(notificationPreferences)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost a race with a concurrent first-read — re-select the row the winner created.
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (!row) throw new Error("Failed to load or create notification preferences.");
  return row;
}

export type UpsertNotificationPreferencesInput = {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  /** "HH:MM" IST wall-clock, or null to turn quiet hours off. */
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

/**
 * Upsert the row for `input.userId`. Callers (the Server Action) must always
 * pass the AUTHENTICATED caller's own id — this function trusts its input and
 * enforces no RBAC/ownership itself, same division of responsibility as
 * upsertReminderSettings (assertCan) vs. its caller, except here "ownership"
 * is simply "you may only ever write your own row".
 */
export async function upsertNotificationPreferences(
  input: UpsertNotificationPreferencesInput,
): Promise<NotificationPreferencesRow> {
  const db = getDb();
  const values = {
    userId: input.userId,
    emailEnabled: input.emailEnabled,
    pushEnabled: input.pushEnabled,
    inAppEnabled: input.inAppEnabled,
    quietHoursStart: input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(notificationPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: {
        emailEnabled: values.emailEnabled,
        pushEnabled: values.pushEnabled,
        inAppEnabled: values.inAppEnabled,
        quietHoursStart: values.quietHoursStart,
        quietHoursEnd: values.quietHoursEnd,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return row;
}

export type NotificationChannel = "email" | "push" | "inApp";

/**
 * The send gate. Call this immediately before a `sendEmail()` at any call
 * site that already has the recipient's `userId` in scope — returns false
 * (skip the send, and don't write an emailLog row, since nothing was sent)
 * when the recipient disabled the channel, or `now` falls inside their
 * configured IST quiet-hours window.
 *
 * "push"/"inApp" are accepted for forward-compatibility (so a future push/
 * in-app sender can call the same gate) but nothing in this codebase sends
 * through those channels yet — see the file header.
 */
export async function isNotificationAllowed(
  userId: string,
  options: { channel: NotificationChannel; now?: Date },
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  const enabled =
    options.channel === "email"
      ? prefs.emailEnabled
      : options.channel === "push"
        ? prefs.pushEnabled
        : prefs.inAppEnabled;
  if (!enabled) return false;
  return !isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, options.now);
}
