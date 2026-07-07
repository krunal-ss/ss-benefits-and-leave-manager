import { requireAccess } from "@/server/auth/current-user";
import { getReminderAudienceCount, loadReminderSettings } from "@/server/hr/reminder-settings";
import { currentFy } from "@/lib/fy";
import { formatDateLong } from "@/lib/format";
import { RemindersClient } from "./reminders-client";

export const metadata = { title: "Benefit reminders · SmartSense" };

// KAN-148 — HR/Admin config screen for the Remaining Benefit Reminder feature:
// schedule checkpoints, delivery channels, and the unused-balance audience
// threshold that also drives the employee dashboard banner
// (src/server/employee/reminder-banner.ts). Server Component, HR/admin-gated
// via requireAccess; loads the single settings row + audience count and hands
// them to a client form that persists changes through saveReminderSettingsAction.
export default async function RemindersPage() {
  await requireAccess("/reminders");
  const settings = await loadReminderSettings();
  const audienceCount = await getReminderAudienceCount(settings.thresholdPaise);
  const fy = currentFy();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Benefit reminders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nudge employees to use their benefit wallet before the financial year closes on{" "}
          {formatDateLong(fy.end)}.
        </p>
      </div>
      <RemindersClient
        settings={settings}
        initialAudienceCount={audienceCount}
        fyEndIso={fy.end}
        fyEndLabel={formatDateLong(fy.end)}
      />
    </div>
  );
}
