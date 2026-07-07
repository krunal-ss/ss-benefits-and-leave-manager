"use client";

// KAN-168 — Client form for the personal "Notification preferences" screen.
// Owns the draft channel-toggle + quiet-hours state and persists it through
// updateNotificationPreferencesAction. Mirrors the shape of
// src/app/(app)/reminders/reminders-client.tsx's "Delivery channels" card,
// scaled down to this feature's fields.
import { useId, useState } from "react";
import { Bell, Check, Mail, MessageSquare, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fieldBaseClass } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { updateNotificationPreferencesAction } from "@/server/actions/notification-preferences";
import type { NotificationPreferencesRow } from "@/server/notifications/preferences";
import { useNotificationPreferencesSave } from "./use-notification-preferences-save";

type Channel = {
  key: "emailEnabled" | "pushEnabled" | "inAppEnabled";
  label: string;
  detail: string;
  icon: typeof Mail;
};

const CHANNELS: Channel[] = [
  {
    key: "emailEnabled",
    label: "Email",
    detail: "Expense decisions, leave/WFH routing and decisions, reminders.",
    icon: Mail,
  },
  {
    key: "pushEnabled",
    label: "Browser push",
    detail: "Recorded for later — no push notifications are sent yet.",
    icon: Bell,
  },
  {
    key: "inAppEnabled",
    label: "In-app",
    detail: "Recorded for later — there is no in-app notification center yet.",
    icon: MessageSquare,
  },
];

const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";

export function NotificationPreferencesClient({ preferences }: { preferences: NotificationPreferencesRow }) {
  const [emailEnabled, setEmailEnabled] = useState(preferences.emailEnabled);
  const [pushEnabled, setPushEnabled] = useState(preferences.pushEnabled);
  const [inAppEnabled, setInAppEnabled] = useState(preferences.inAppEnabled);
  const [quietHoursOn, setQuietHoursOn] = useState(
    !!preferences.quietHoursStart && !!preferences.quietHoursEnd,
  );
  const [quietHoursStart, setQuietHoursStart] = useState(preferences.quietHoursStart ?? DEFAULT_QUIET_START);
  const [quietHoursEnd, setQuietHoursEnd] = useState(preferences.quietHoursEnd ?? DEFAULT_QUIET_END);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { run, pending } = useNotificationPreferencesSave();

  const startId = useId();
  const endId = useId();

  const channelState: Record<Channel["key"], boolean> = { emailEnabled, pushEnabled, inAppEnabled };
  const channelSetter: Record<Channel["key"], (v: boolean) => void> = {
    emailEnabled: setEmailEnabled,
    pushEnabled: setPushEnabled,
    inAppEnabled: setInAppEnabled,
  };

  function save() {
    run(
      () =>
        updateNotificationPreferencesAction({
          emailEnabled,
          pushEnabled,
          inAppEnabled,
          quietHoursStart: quietHoursOn ? quietHoursStart : null,
          quietHoursEnd: quietHoursOn ? quietHoursEnd : null,
        }),
      () => setSavedAt("just now"),
    );
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      <Card className="flex flex-col gap-1 p-5">
        <div className="text-[15px] font-semibold">Channels</div>
        <p className="mb-2 text-xs text-muted-foreground">
          Email is the only channel that actually sends today; push and in-app are recorded for a future
          release.
        </p>
        {CHANNELS.map(({ key, label, detail, icon: Icon }) => {
          const toggle = () => {
            channelSetter[key](!channelState[key]);
            setSavedAt(null);
          };
          return (
            <div
              key={key}
              // The actual Switch button below is the real, keyboard-operable control
              // (with its own aria-label) — this wrapper only widens the mouse/touch hit
              // area to a 44px row, per the design-system skill's touch-target rule.
              // stopPropagation on the Switch's own container avoids a double-toggle
              // when the click lands directly on it.
              className="flex min-h-11 cursor-pointer items-center gap-3 border-t py-3 first:border-t-0"
              onClick={toggle}
            >
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
                <Icon className="size-[17px]" strokeWidth={2} />
              </span>
              <span className="flex-1">
                <span className="block text-[13.5px] font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{detail}</span>
              </span>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch ariaLabel={label} checked={channelState[key]} onCheckedChange={toggle} />
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div
          className="flex min-h-11 cursor-pointer items-center gap-3"
          onClick={() => {
            setQuietHoursOn((v) => !v);
            setSavedAt(null);
          }}
        >
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
            <Moon className="size-[17px]" strokeWidth={2} />
          </span>
          <span className="flex-1">
            <span className="block text-[13.5px] font-medium">Quiet hours</span>
            <span className="block text-xs text-muted-foreground">
              Hold back email during this daily window (India Standard Time).
            </span>
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              ariaLabel="Quiet hours"
              checked={quietHoursOn}
              onCheckedChange={(v) => {
                setQuietHoursOn(v);
                setSavedAt(null);
              }}
            />
          </div>
        </div>
        {quietHoursOn && (
          <div className="flex flex-wrap items-end gap-4 border-t pt-4">
            <div>
              <Label htmlFor={startId}>From</Label>
              <input
                id={startId}
                type="time"
                value={quietHoursStart}
                onChange={(e) => {
                  setQuietHoursStart(e.target.value);
                  setSavedAt(null);
                }}
                className={cn(fieldBaseClass, "h-11 w-[140px] px-3 text-sm")}
              />
            </div>
            <div>
              <Label htmlFor={endId}>To</Label>
              <input
                id={endId}
                type="time"
                value={quietHoursEnd}
                onChange={(e) => {
                  setQuietHoursEnd(e.target.value);
                  setSavedAt(null);
                }}
                className={cn(fieldBaseClass, "h-11 w-[140px] px-3 text-sm")}
              />
            </div>
            <p className="mb-2.5 text-xs text-muted-foreground">
              A window past midnight (e.g. 22:00 → 07:00) is supported.
            </p>
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2.5">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save preferences"}
        </Button>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-emerald-500">
            <Check className="size-[15px]" strokeWidth={2.4} />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
