"use client";

import { useTransition } from "react";
import { ShieldAlert, TriangleAlert, UserCog, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SlaBadge, useSla } from "@/components/ui/sla-badge";
import { useToast } from "@/components/providers";
import { decideLeaveAction } from "@/server/actions/approve-leave";
import type { ApprovalRequest } from "@/server/manager/approvals";
import { LEAVE_SLA_HOURS } from "@/server/sla";
import { cn } from "@/lib/cn";
import { kindClasses } from "./kind";
import { Field } from "@/app/(app)/approvals/field";
import { LevelProgress } from "@/app/(app)/approvals/level-progress";

export function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();
  const k = kindClasses(request.kind);
  const l1done = request.level >= 2;
  // KAN-77 — computed server-side when the queue loaded, so the approver sees
  // it on the card itself before making a decision (advisory only — never
  // disables Approve).
  const thresholdWarnings = request.warnings.filter((w) => w.type === "threshold");
  const criticalRoleWarnings = request.warnings.filter((w) => w.type === "critical_role");
  // KAN-147 — informational only in this pass: no cron/email actually escalates yet.
  const sla = useSla(request.createdAt, LEAVE_SLA_HOURS);
  const slaTargetLabel = l1done ? "L2 · 24h SLA" : "L1 · 24h SLA";
  const escalateTo = l1done ? "HR Head (skip-level)" : "Project Manager (L2)";

  const decide = (approve: boolean) => {
    startTransition(async () => {
      const res = await decideLeaveAction({ requestId: request.id, approve });
      flash(res.message, res.ok ? "ok" : "warn");
    });
  };

  return (
    <Card className="flex flex-col gap-3.5 px-5 py-[18px]">
      <div className="flex items-center gap-3">
        <Avatar initials={request.initials} className="size-[38px] text-[13px]" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{request.name}</div>
          <div className="text-[12.5px] text-muted-foreground">{request.role}</div>
        </div>
        <span className={cn("ml-auto inline-flex h-6 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium", k.badge)}>
          <span className={cn("size-[7px] rounded-full", k.dot)} />
          {request.type}
        </span>
      </div>

      {/* KAN-225 — visible via a delegation, not your own report. */}
      {request.onBehalfOf && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-[7px] bg-blue-600/10 px-2.5 py-1 text-[11.5px] font-medium text-blue-700 dark:text-blue-400">
          <UserCog className="size-[13px]" strokeWidth={2} />
          Acting on behalf of {request.onBehalfOf}
        </span>
      )}

      <div className="flex flex-wrap gap-[22px]">
        <Field label="Dates" value={request.dates} />
        <Field label="Working days" value={request.days} />
        <div className="min-w-[140px] flex-1">
          <div className="text-[11.5px] text-muted-foreground">Reason</div>
          <div className="text-[13.5px]">{request.reason}</div>
        </div>
      </div>

      <LevelProgress l1done={l1done} />

      <SlaBadge createdAtIso={request.createdAt} targetHours={LEAVE_SLA_HOURS} variant="row" targetLabel={slaTargetLabel} />

      {sla.state === "overdue" && (
        <div className="flex items-center gap-2.5 rounded-[9px] bg-red-500/[0.09] px-3 py-[9px] text-[12.5px] text-destructive">
          <Zap className="size-[15px] shrink-0" strokeWidth={2} />
          <span>
            SLA breached · auto-escalated to <strong>{escalateTo}</strong>
          </span>
        </div>
      )}

      {thresholdWarnings.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[9px] bg-amber-500/[0.12] px-[13px] py-[11px] text-[12.5px] text-amber-700">
          <TriangleAlert className="mt-0.5 size-[15px] shrink-0" strokeWidth={2} />
          <span>
            Approving would drop team availability below the configured threshold on{" "}
            {thresholdWarnings.length === 1 ? thresholdWarnings[0].date : `${thresholdWarnings.length} day(s)`}.
          </span>
        </div>
      )}
      {criticalRoleWarnings.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[9px] bg-amber-500/[0.12] px-[13px] py-[11px] text-[12.5px] text-amber-700">
          <ShieldAlert className="mt-0.5 size-[15px] shrink-0" strokeWidth={2} />
          <span>
            {request.name} is the only available critical-role holder on{" "}
            {criticalRoleWarnings.length === 1 ? criticalRoleWarnings[0].date : `${criticalRoleWarnings.length} day(s)`} —
            approving would leave the team without coverage.
          </span>
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground">
          {l1done ? "Awaiting your L2 decision (Project Manager)" : "Your L1 decision (Team Lead)"}
        </span>
        <Button
          variant="destructive-outline"
          onClick={() => decide(false)}
          disabled={pending}
          className="ml-auto h-[34px] rounded-lg px-3.5 text-[13px]"
        >
          Reject
        </Button>
        <Button onClick={() => decide(true)} disabled={pending} className="h-[34px] rounded-lg px-4 text-[13px]">
          {l1done ? "Approve (final)" : "Approve → L2"}
        </Button>
      </div>
    </Card>
  );
}
