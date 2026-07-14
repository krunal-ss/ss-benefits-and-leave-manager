"use server";

// KAN-168 — Save the caller's own notification preferences from the personal
// "/settings/notifications" screen. Unlike every other src/app/(app)/settings/
// screen (HR/Admin-gated single/multi-row config), this is a PER-USER row and
// any authenticated role may edit their own — there is no assertCan check
// here, only requireUser(). The action always operates on `me.id`; it never
// accepts a target userId from the client, so a user can only ever read/edit
// their own preferences (enforced by construction, not by an ownership check).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { upsertNotificationPreferences } from "@/server/notifications/preferences";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:MM.")
  .nullable();

const saveSchema = z
  .object({
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
    quietHoursStart: timeSchema,
    quietHoursEnd: timeSchema,
  })
  .refine((v) => (v.quietHoursStart === null) === (v.quietHoursEnd === null), {
    message: "Set both a quiet-hours start and end, or clear both.",
    path: ["quietHoursEnd"],
  });

export type SaveNotificationPreferencesResult = { ok: boolean; message: string };

export async function updateNotificationPreferencesAction(
  input: z.input<typeof saveSchema>,
): Promise<SaveNotificationPreferencesResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  await upsertNotificationPreferences({
    userId: me.id,
    emailEnabled: parsed.data.emailEnabled,
    pushEnabled: parsed.data.pushEnabled,
    inAppEnabled: parsed.data.inAppEnabled,
    quietHoursStart: parsed.data.quietHoursStart,
    quietHoursEnd: parsed.data.quietHoursEnd,
  });

  revalidatePath("/settings/notifications");
  return { ok: true, message: "Notification preferences saved." };
}
