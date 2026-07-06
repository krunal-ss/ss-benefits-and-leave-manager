"use client";

import { useTransition } from "react";
import { CalendarX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/providers";
import { decideLeaveCancellationAction } from "@/server/actions/cancel-approved-leave";
import type { CancellationRequest } from "@/server/manager/approvals";
import { Field } from "@/app/(app)/approvals/field";

/** KAN-127 — a distinct card for a pending cancellation of an already-approved request (no L1/L2 stepper; it's a single accept/decline). */
export function CancellationCard({ request }: { request: CancellationRequest }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();

  const decide = (approve: boolean) => {
    startTransition(async () => {
      const res = await decideLeaveCancellationAction({ requestId: request.id, approve });
      flash(res.message, res.ok ? "ok" : "warn");
    });
  };

  return (
    <Card className="flex flex-col gap-3.5 border-violet-600/30 px-5 py-[18px]">
      <div className="flex items-center gap-3">
        <Avatar initials={request.initials} className="size-[38px] text-[13px]" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{request.name}</div>
          <div className="text-[12.5px] text-muted-foreground">{request.role}</div>
        </div>
        <span className="ml-auto inline-flex h-6 items-center gap-1.5 rounded-[7px] bg-violet-600/[0.13] px-2.5 text-xs font-medium text-violet-600">
          <CalendarX className="size-[13px]" strokeWidth={2} />
          Cancel · {request.type}
        </span>
      </div>

      <div className="flex flex-wrap gap-[22px]">
        <Field label="Dates" value={request.dates} />
        <Field label="Working days" value={request.days} />
        <div className="min-w-[140px] flex-1">
          <div className="text-[11.5px] text-muted-foreground">Reason for cancelling</div>
          <div className="text-[13.5px]">{request.reason}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-[9px] bg-violet-600/[0.08] px-[13px] py-[11px] text-[12.5px] text-violet-600">
        <CalendarX className="size-[15px] shrink-0" strokeWidth={2} />
        <span>Cancellation of an already-approved leave — approving restores {request.days}.</span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="text-xs text-muted-foreground">Approving restores their balance and frees the calendar</span>
        <Button
          variant="destructive-outline"
          onClick={() => decide(false)}
          disabled={pending}
          className="ml-auto h-[34px] rounded-lg px-3.5 text-[13px]"
        >
          Decline
        </Button>
        <Button onClick={() => decide(true)} disabled={pending} className="h-[34px] rounded-lg px-4 text-[13px]">
          Approve cancellation
        </Button>
      </div>
    </Card>
  );
}
