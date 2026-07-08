// KAN-148 — shared (isomorphic, no "server-only") constants for the benefit
// reminder feature, so both the server module (src/server/hr/reminder-settings.ts)
// and the client settings form (src/app/(app)/reminders/reminders-client.tsx)
// reference the same fixed set instead of redefining it.

/** The fixed set of day-count checkpoints the schedule UI can toggle. */
export const LEAD_DAY_OPTIONS = [90, 60, 30, 14, 7] as const;

export type ReminderFrequency = "once" | "weekly" | "daily";

export const FREQUENCY_OPTIONS: { value: ReminderFrequency; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "daily", label: "Daily · final week" },
];
