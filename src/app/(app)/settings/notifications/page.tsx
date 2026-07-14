import { requireAccess } from "@/server/auth/current-user";
import { getNotificationPreferences } from "@/server/notifications/preferences";
import { NotificationPreferencesClient } from "./notification-preferences-client";

export const metadata = { title: "Notification preferences · SmartSense" };

// KAN-168 — the first PERSONAL (non-HR/Admin) settings screen in this app:
// every authenticated role configures their own row, unlike the HR/Admin-only
// settings/* screens (approvals, staffing-thresholds). requireAccess still
// gates the route (auth-only — see the ALL_ROLES entry in src/server/users.ts)
// but there is no assertCan check anywhere in this feature's write path.
export default async function NotificationPreferencesPage() {
  const user = await requireAccess("/settings/notifications");
  const preferences = await getNotificationPreferences(user.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Notification preferences</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which channels notify you, and set quiet hours during which email is held back.
        </p>
      </div>
      <NotificationPreferencesClient preferences={preferences} />
    </div>
  );
}
