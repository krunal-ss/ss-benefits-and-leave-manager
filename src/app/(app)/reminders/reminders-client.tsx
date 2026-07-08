"use client";

// KAN-148 — Client form for the "Benefit reminders" HR settings screen. Owns
// the draft schedule/channels/threshold state, calls saveReminderSettingsAction
// / sendReminderTestAction / getReminderAudienceCountAction (live preview as
// the threshold changes), and mirrors the design's two-column layout: editable
// cards on the left, a sticky "Schedule summary" + "Email preview" on the right.
import { useEffect, useState } from "react";
import { Check, LayoutGrid, Mail, Send, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { formatINR, formatDateLong } from "@/lib/format";
import { FREQUENCY_OPTIONS, LEAD_DAY_OPTIONS, type ReminderFrequency } from "@/lib/reminder-constants";
import {
  getReminderAudienceCountAction,
  saveReminderSettingsAction,
  sendReminderTestAction,
} from "@/server/actions/reminder-settings";
import type { BenefitReminderSettingsRow } from "@/server/hr/reminder-settings";
import { useReminderSave } from "./use-reminder-save";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function RemindersClient({
  settings,
  initialAudienceCount,
  fyEndIso,
  fyEndLabel,
}: {
  settings: BenefitReminderSettingsRow;
  initialAudienceCount: number;
  fyEndIso: string;
  fyEndLabel: string;
}) {
  const [leadDays, setLeadDays] = useState<number[]>(settings.leadDaysBeforeFyEnd);
  const [frequency, setFrequency] = useState<ReminderFrequency>(settings.frequency);
  const [dashboardEnabled, setDashboardEnabled] = useState(settings.dashboardEnabled);
  const [emailEnabled, setEmailEnabled] = useState(settings.emailEnabled);
  const [thresholdRupees, setThresholdRupees] = useState(String(settings.thresholdPaise / 100));
  const [audienceCount, setAudienceCount] = useState(initialAudienceCount);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const { run, pending } = useReminderSave();

  const thresholdNum = Number(thresholdRupees) || 0;

  // Live "{N} employees currently qualify" preview as the threshold changes —
  // debounced so it doesn't fire a Server Action on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      getReminderAudienceCountAction(thresholdNum)
        .then(setAudienceCount)
        .catch(() => {});
    }, 350);
    return () => clearTimeout(handle);
  }, [thresholdNum]);

  function toggleLeadDay(day: number) {
    setLeadDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      return next.sort((a, b) => b - a);
    });
    setSavedAt(null);
  }

  function save() {
    run(
      () =>
        saveReminderSettingsAction({
          leadDaysBeforeFyEnd: leadDays,
          frequency,
          dashboardEnabled,
          emailEnabled,
          thresholdRupees: thresholdNum,
        }),
      () => setSavedAt("just now"),
    );
  }

  function sendTest() {
    run(() => sendReminderTestAction());
  }

  const maxLead = leadDays.length ? Math.max(...leadDays) : 0;
  const nextSendLabel = maxLead ? formatDateLong(addDaysIso(fyEndIso, maxLead)) : "Not scheduled";
  const leadSummary = leadDays.length ? leadDays.map((d) => `${d}d`).join(", ") : "None selected";

  return (
    <div className="grid max-w-[1120px] grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-4">
        {/* Reminder schedule */}
        <Card className="flex flex-col gap-[18px] p-5">
          <div className="text-[15px] font-semibold">Reminder schedule</div>
          <div>
            <Label className="mb-2 block">Send reminders these many days before FY-end</Label>
            <div className="flex flex-wrap gap-2">
              {LEAD_DAY_OPTIONS.map((day) => {
                const active = leadDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleLeadDay(day)}
                    className={cn(
                      "tabular h-9 min-w-[52px] cursor-pointer rounded-[9px] border px-3.5 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground hover:bg-accent",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[11.5px] text-muted-foreground">
              Tap to toggle each checkpoint. Reminders stop once the balance reaches zero.
            </div>
          </div>
          <div className="h-px bg-border" />
          <div>
            <Label className="mb-2 block">Cadence between checkpoints</Label>
            <Segmented
              ariaLabel="Cadence between checkpoints"
              value={frequency}
              onChange={(v) => {
                setFrequency(v);
                setSavedAt(null);
              }}
              options={FREQUENCY_OPTIONS}
            />
          </div>
        </Card>

        {/* Delivery channels */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-[15px] font-semibold">Delivery channels</div>
          <label className="flex cursor-pointer items-center gap-3">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
              <LayoutGrid className="size-[17px]" strokeWidth={2} />
            </span>
            <span className="flex-1">
              <span className="block text-[13.5px] font-medium">Dashboard banner</span>
              <span className="block text-xs text-muted-foreground">
                Shows on the employee home until dismissed or spent.
              </span>
            </span>
            <Switch
              ariaLabel="Dashboard banner"
              checked={dashboardEnabled}
              onCheckedChange={(v) => {
                setDashboardEnabled(v);
                setSavedAt(null);
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
              <Mail className="size-[17px]" strokeWidth={2} />
            </span>
            <span className="flex-1">
              <span className="block text-[13.5px] font-medium">Email reminder</span>
              <span className="block text-xs text-muted-foreground">
                Personalised email with the employee&apos;s unused balance.
              </span>
            </span>
            <Switch
              ariaLabel="Email reminder"
              checked={emailEnabled}
              onCheckedChange={(v) => {
                setEmailEnabled(v);
                setSavedAt(null);
              }}
            />
          </label>
        </Card>

        {/* Who gets reminded */}
        <Card className="flex flex-col gap-3 p-5">
          <div className="text-[15px] font-semibold">Who gets reminded</div>
          <Label htmlFor="reminderThreshold">Only remind employees with unused balance above</Label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative inline-flex items-center">
              <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground">₹</span>
              <Input
                id="reminderThreshold"
                inputMode="numeric"
                className="tabular w-40 pl-6"
                value={thresholdRupees}
                onChange={(e) => {
                  setThresholdRupees(e.target.value.replace(/[^0-9]/g, ""));
                  setSavedAt(null);
                }}
              />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Users className="size-[15px]" strokeWidth={2} />
              <strong className="font-semibold text-foreground">{audienceCount}</strong> employees currently
              qualify
            </span>
          </div>
        </Card>

        <div className="flex items-center gap-2.5">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save schedule"}
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={pending}>
            <Send className="size-[15px]" strokeWidth={2} />
            Send test to me
          </Button>
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-emerald-500">
              <Check className="size-[15px]" strokeWidth={2.4} />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Live summary + preview */}
      <div className="sticky top-[78px] flex flex-col gap-4">
        <Card className="flex flex-col gap-3 px-5 py-[18px]">
          <div className="text-sm font-semibold">Schedule summary</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[12.5px] text-muted-foreground">Next send</span>
            <span className="ml-auto text-[15px] font-semibold">{nextSendLabel}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between text-[12.5px]">
            <span className="text-muted-foreground">Checkpoints</span>
            <span className="text-right font-medium">{leadSummary}</span>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-muted-foreground">Threshold</span>
            <span className="font-medium">{formatINR(thresholdNum)}</span>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-muted-foreground">Audience</span>
            <span className="font-medium">{audienceCount} employees</span>
          </div>
          <div className="flex justify-between text-[12.5px]">
            <span className="text-muted-foreground">FY closes</span>
            <span className="font-medium">{fyEndLabel}</span>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-[13px]">
            <Mail className="size-[15px] text-muted-foreground" strokeWidth={2} />
            <span className="text-[13.5px] font-semibold">Email preview</span>
          </div>
          <div className="bg-muted/45 p-4">
            <div className="overflow-hidden rounded-[10px] border bg-card shadow-xs">
              <div className="border-b px-4 py-[13px]">
                <div className="text-[11px] text-muted-foreground">From · benefits@smartsense.com</div>
                <div className="mt-[3px] text-sm font-semibold">
                  You have {formatINR(thresholdNum)}+ in unused benefits
                </div>
              </div>
              <div className="flex flex-col gap-[11px] p-4">
                <div className="text-[12.5px] leading-[1.55]">Hi there,</div>
                <div className="text-[12.5px] leading-[1.55] text-muted-foreground">
                  Your benefit wallet still has more than{" "}
                  <strong className="text-foreground">{formatINR(thresholdNum)}</strong> unused across Sports
                  and Learning. This balance does not carry over past{" "}
                  <strong className="text-foreground">{fyEndLabel}</strong> — submit your claims before then
                  to make full use of it.
                </div>
                <div className="my-0.5 text-[11.5px] text-muted-foreground">
                  Reaches <strong className="text-foreground">{audienceCount}</strong> employees who currently
                  qualify.
                </div>
                <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground">
                  Submit a claim
                </div>
                <div className="mt-0.5 border-t pt-2.5 text-[11px] text-muted-foreground">
                  Sent by SmartSense People Ops · you can manage reminder settings in the portal.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
