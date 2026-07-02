"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, CircleAlert, House, ShieldAlert, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/providers";
import { applyLeaveAction, previewLeaveWarningsAction } from "@/server/actions/leave";
import { LEAVE_TYPES, type LeaveTypeKey } from "@/server/leave";
import type { ApproverOption } from "@/server/manager/directory";
import type { StaffingWarning } from "@/server/manager/staffing-guard";
import { workingDaysBetween } from "@/lib/working-days";
import { cn } from "@/lib/cn";

const EMPTY = {
  type: "CL" as LeaveTypeKey,
  from: "2026-07-06",
  to: "2026-07-08",
  halfDay: false,
  reason: "",
  teamLeadId: "",
  projectManagerId: "",
};

const selectCls =
  "h-[38px] w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30";

const dateInputCls =
  "h-[38px] w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30";

export function LeaveForm({
  balances,
  teamLeads,
  projectManagers,
  defaultTeamLeadId,
  defaultProjectManagerId,
  existingRanges = [],
}: {
  balances: Record<LeaveTypeKey, number>;
  teamLeads: ApproverOption[];
  projectManagers: ApproverOption[];
  defaultTeamLeadId?: string | null;
  defaultProjectManagerId?: string | null;
  /** Active (non-rejected/cancelled) requests, used to block double-booking. */
  existingRanges?: { from: string; to: string }[];
}) {
  const { flash } = useToast();
  const [leave, setLeave] = useState(() => ({
    ...EMPTY,
    teamLeadId: defaultTeamLeadId ?? "",
    projectManagerId: defaultProjectManagerId ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [submitTried, setSubmitTried] = useState(false);
  const [pending, startTransition] = useTransition();
  // KAN-77 — advisory staffing warnings, refreshed live as the request shape
  // changes so the applicant sees them WHILE filling the form, not only after
  // submitting (the story's own AC: non-blocking, but visible up front).
  const [warnings, setWarnings] = useState<StaffingWarning[]>([]);

  const set = (patch: Partial<typeof leave>) => {
    setLeave((l) => ({ ...l, ...patch }));
    setSubmitted(false);
  };

  const teamLeadName = teamLeads.find((t) => t.id === leave.teamLeadId)?.name;
  const projectManagerName = projectManagers.find((p) => p.id === leave.projectManagerId)?.name;

  const { days: wd, skipped } = workingDaysBetween(leave.from, leave.to, leave.halfDay);
  const isWFH = leave.type === "WFH";
  const isLOP = leave.type === "LOP";
  const bal = balances[leave.type];
  const exceeds = !isWFH && !isLOP && wd > bal;

  // ISO yyyy-mm-dd strings compare lexicographically, so range overlap is a
  // plain string comparison: existing.from <= new.to AND existing.to >= new.from.
  const reasonMissing = leave.reason.trim().length < 3;
  const fromMissing = leave.from.trim().length === 0;
  const toMissing = leave.to.trim().length === 0;
  const teamLeadMissing = !leave.teamLeadId;
  const projectManagerMissing = !leave.projectManagerId;
  const overlaps =
    wd > 0 && existingRanges.some((r) => r.from <= leave.to && r.to >= leave.from);

  const balBox = isWFH
    ? { msg: "WFH does not deduct any leave balance.", cls: "bg-violet-600/10 text-violet-600", Icon: House }
    : isLOP
      ? { msg: "Loss of Pay — these days are unpaid, no balance used.", cls: "bg-amber-500/[0.12] text-amber-700", Icon: CircleAlert }
      : exceeds
        ? { msg: "Exceeds available balance — extra days will be marked LOP.", cls: "bg-red-500/[0.11] text-destructive", Icon: TriangleAlert }
        : { msg: `Within balance — ${Math.max(0, bal - wd)} day(s) will remain.`, cls: "bg-emerald-500/[0.11] text-emerald-500", Icon: Check };

  const skippedNote = leave.halfDay
    ? "Half-day request · counts as 0.5 working day."
    : skipped > 0
      ? `${skipped} weekend/holiday day(s) excluded from the count.`
      : "No weekends or holidays in this range.";

  const balLabel = isWFH ? "WFH balance" : "Available balance";
  const balText = isWFH ? `${bal} days left this month` : isLOP ? "N/A (unpaid)" : `${bal} days`;

  // KAN-77 — debounced live preview: re-check whenever the request shape
  // changes, so the warning is visible before the applicant ever clicks submit.
  useEffect(() => {
    if (wd <= 0 || overlaps) {
      setWarnings([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      previewLeaveWarningsAction({
        requestType: leave.type,
        from: leave.from,
        to: leave.to,
        halfDay: leave.halfDay,
      }).then((res) => {
        if (!cancelled) setWarnings(res.warnings);
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [leave.type, leave.from, leave.to, leave.halfDay, wd, overlaps]);

  const thresholdWarnings = warnings.filter((w) => w.type === "threshold");
  const criticalRoleWarnings = warnings.filter((w) => w.type === "critical_role");

  function submit() {
    setSubmitTried(true);
    if (wd <= 0) {
      flash("Pick a valid date range first.", "warn");
      return;
    }
    if (!leave.teamLeadId || !leave.projectManagerId) {
      flash("Select your Team Lead and Project Manager first.", "warn");
      return;
    }
    if (reasonMissing) {
      flash("Please add a reason for your request.", "warn");
      return;
    }
    if (overlaps) {
      flash("You already have a leave/WFH request on one of these dates.", "warn");
      return;
    }
    startTransition(async () => {
      const res = await applyLeaveAction({
        requestType: leave.type,
        from: leave.from,
        to: leave.to,
        halfDay: leave.halfDay,
        reason: leave.reason,
        teamLeadId: leave.teamLeadId,
        projectManagerId: leave.projectManagerId,
      });
      if (!res.ok) {
        flash(res.error ?? "Could not submit the request", "warn");
        return;
      }
      setSubmitted(true);
      setWarnings(res.warnings ?? []); // reconcile with the action's own (authoritative) check
      const lopNote = res.lopDays && res.lopDays > 0 ? ` · ${res.lopDays} day(s) over balance flagged LOP` : "";
      flash(`Request submitted — sent to ${teamLeadName ?? "your Team Lead"} (L1)${lopNote}`, "ok");
    });
  }

  const BalIcon = balBox.Icon;

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Apply for leave / WFH</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll count working days, check your balance, and route it through your reporting line.
        </p>
      </div>

      <div className="grid max-w-[980px] grid-cols-[1.5fr_1fr] items-start gap-5">
        <Card className="flex flex-col gap-[18px] px-6 py-[22px]">
          <div>
            <Label>Request type</Label>
            <div className="flex flex-wrap gap-2">
              {LEAVE_TYPES.map((lt) => {
                const active = leave.type === lt.key;
                return (
                  <button
                    key={lt.key}
                    onClick={() => set({ type: lt.key })}
                    className={cn(
                      "h-[34px] cursor-pointer rounded-lg border px-[13px] text-[12.5px] font-medium",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-accent",
                    )}
                  >
                    {lt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <Label>
                From <span className="text-destructive">*</span>
              </Label>
              <input
                type="date"
                value={leave.from}
                onChange={(e) => set({ from: e.target.value })}
                aria-invalid={submitTried && fromMissing}
                aria-required
                className={dateInputCls}
              />
              {submitTried && fromMissing && (
                <p className="mt-1.5 text-[12px] text-destructive">A from date is required.</p>
              )}
            </div>
            <div>
              <Label>
                To <span className="text-destructive">*</span>
              </Label>
              <input
                type="date"
                value={leave.to}
                onChange={(e) => set({ to: e.target.value })}
                aria-invalid={submitTried && toMissing}
                aria-required
                className={dateInputCls}
              />
              {submitTried && toMissing && (
                <p className="mt-1.5 text-[12px] text-destructive">A to date is required.</p>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={leave.halfDay}
              onClick={() => set({ halfDay: !leave.halfDay })}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                leave.halfDay ? "bg-primary" : "bg-input",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-xs transition-transform",
                  leave.halfDay && "translate-x-4",
                )}
              />
            </button>
            <span className="text-[13px]">Half-day (applies to a single date)</span>
          </label>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <Label>
                Team Lead (L1) <span className="text-destructive">*</span>
              </Label>
              <select
                value={leave.teamLeadId}
                onChange={(e) => set({ teamLeadId: e.target.value })}
                aria-invalid={submitTried && teamLeadMissing}
                aria-required
                className={selectCls}
              >
                <option value="">Select a Team Lead…</option>
                {teamLeads.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {submitTried && teamLeadMissing && (
                <p className="mt-1.5 text-[12px] text-destructive">A Team Lead is required.</p>
              )}
            </div>
            <div>
              <Label>
                Project Manager (L2) <span className="text-destructive">*</span>
              </Label>
              <select
                value={leave.projectManagerId}
                onChange={(e) => set({ projectManagerId: e.target.value })}
                aria-invalid={submitTried && projectManagerMissing}
                aria-required
                className={selectCls}
              >
                <option value="">Select a Project Manager…</option>
                {projectManagers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {submitTried && projectManagerMissing && (
                <p className="mt-1.5 text-[12px] text-destructive">A Project Manager is required.</p>
              )}
            </div>
          </div>

          <div>
            <Label>
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={leave.reason}
              onChange={(e) => set({ reason: e.target.value })}
              placeholder="Add context for your approvers…"
              aria-invalid={submitTried && reasonMissing}
              aria-required
            />
            {submitTried && reasonMissing && (
              <p className="mt-1.5 text-[12px] text-destructive">A reason is required.</p>
            )}
          </div>

          {overlaps && (
            <div className="flex items-center gap-2.5 rounded-[9px] bg-red-500/[0.11] px-[13px] py-[11px] text-[12.5px] text-destructive">
              <TriangleAlert className="size-[15px] shrink-0" strokeWidth={2} />
              <span>You already have a leave/WFH request that covers one of these dates.</span>
            </div>
          )}

          {/* KAN-77 — advisory only: shown so the applicant is aware before/while
              submitting, but never blocks the Submit button. */}
          {thresholdWarnings.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-[9px] bg-amber-500/[0.12] px-[13px] py-[11px] text-[12.5px] text-amber-700">
              <TriangleAlert className="mt-0.5 size-[15px] shrink-0" strokeWidth={2} />
              <span>
                Team availability would drop below the configured staffing threshold on{" "}
                {thresholdWarnings.length === 1 ? thresholdWarnings[0].date : `${thresholdWarnings.length} day(s)`} — your
                approver will see the same warning.
              </span>
            </div>
          )}
          {criticalRoleWarnings.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-[9px] bg-amber-500/[0.12] px-[13px] py-[11px] text-[12.5px] text-amber-700">
              <ShieldAlert className="mt-0.5 size-[15px] shrink-0" strokeWidth={2} />
              <span>
                No other critical-role holder would be available to cover for you on{" "}
                {criticalRoleWarnings.length === 1 ? criticalRoleWarnings[0].date : `${criticalRoleWarnings.length} day(s)`}.
              </span>
            </div>
          )}

          {submitted && (
            <div className="flex items-center gap-[11px] rounded-[10px] border border-emerald-500/35 bg-emerald-500/10 px-4 py-[13px]">
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-[13px]" strokeWidth={3} />
              </span>
              <div className="text-[13px]">
                <div className="font-semibold">Request submitted</div>
                <div className="text-muted-foreground">
                  Emailed to {teamLeadName ?? "your Team Lead"} (L1). You can withdraw it before the start date.
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-0.5">
            <Button onClick={submit} disabled={pending || overlaps} className="flex-1">
              {pending ? "Submitting…" : "Submit request"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setLeave(EMPTY);
                setSubmitted(false);
                setSubmitTried(false);
              }}
            >
              Reset
            </Button>
          </div>
        </Card>

        <div className="sticky top-[78px] flex flex-col gap-4">
          <Card className="flex flex-col gap-3.5 px-5 py-[18px]">
            <div className="text-sm font-semibold">Request summary</div>
            <div className="flex items-baseline gap-2">
              <span className="tabular text-[32px] font-semibold tracking-[-0.02em]">{wd}</span>
              <span className="text-[13px] text-muted-foreground">working day(s)</span>
            </div>
            <div className="text-[12.5px] leading-normal text-muted-foreground">{skippedNote}</div>
            <div className="h-px bg-border" />
            <div className="flex justify-between text-[13px]">
              <span className="text-muted-foreground">{balLabel}</span>
              <span className="font-medium">{balText}</span>
            </div>
            <div className={cn("flex items-center gap-2.5 rounded-[9px] px-[13px] py-[11px] text-[12.5px]", balBox.cls)}>
              <BalIcon className="size-[15px] shrink-0" strokeWidth={2} />
              <span>{balBox.msg}</span>
            </div>
          </Card>

          <Card className="px-5 py-[18px]">
            <div className="mb-3.5 text-sm font-semibold">Approval route</div>
            <div className="flex flex-col">
              {[
                { level: 1, name: teamLeadName, title: "Team Lead · L1" },
                { level: 2, name: projectManagerName, title: "Project Manager · L2" },
              ].map((step, i, arr) => (
                <div key={step.level}>
                  <div className="flex items-center gap-[11px]">
                    <div
                      className={cn(
                        "flex size-[26px] items-center justify-center rounded-full text-[11px] font-semibold",
                        i === 0 ? "bg-primary text-primary-foreground" : "border bg-muted text-muted-foreground",
                      )}
                    >
                      {step.level}
                    </div>
                    <div>
                      <div className={cn("text-[13px] font-medium", !step.name && "text-muted-foreground")}>
                        {step.name ?? "Not selected yet"}
                      </div>
                      <div className="text-[11.5px] text-muted-foreground">{step.title}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && <div className="ml-3 h-4 w-0.5 bg-border" />}
                </div>
              ))}
            </div>
            <div className="mt-3.5 text-[11.5px] leading-normal text-muted-foreground">
              Sequential policy · email goes to each approver on submit and at every decision.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
