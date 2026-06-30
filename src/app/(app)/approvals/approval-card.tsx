"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/providers";
import { decideLeaveAction } from "@/server/actions/approve-leave";
import type { ApprovalRequest } from "@/server/manager/approvals";
import { cn } from "@/lib/cn";
import { kindClasses } from "./kind";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="text-[13.5px] font-medium">{value}</div>
    </div>
  );
}

function LevelProgress({ l1done }: { l1done: boolean }) {
  return (
    <div className="flex items-center gap-2 border-y py-2.5">
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", l1done ? "text-emerald-500" : "text-foreground")}>
        <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
          {l1done ? "✓" : "•"}
        </span>
        L1 · Team Lead
      </span>
      <span className="h-px flex-1 bg-border" />
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", l1done ? "text-amber-700" : "text-muted-foreground")}>
        <span
          className={cn(
            "inline-flex size-[18px] items-center justify-center rounded-full border text-[10px] font-bold",
            l1done ? "border-amber-500 bg-amber-500 text-white" : "border-border bg-muted text-muted-foreground",
          )}
        >
          {l1done ? "•" : "2"}
        </span>
        L2 · Project Manager
      </span>
    </div>
  );
}

export function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();
  const k = kindClasses(request.kind);
  const l1done = request.level >= 2;

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

      <div className="flex flex-wrap gap-[22px]">
        <Field label="Dates" value={request.dates} />
        <Field label="Working days" value={request.days} />
        <div className="min-w-[140px] flex-1">
          <div className="text-[11.5px] text-muted-foreground">Reason</div>
          <div className="text-[13.5px]">{request.reason}</div>
        </div>
      </div>

      <LevelProgress l1done={l1done} />

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
