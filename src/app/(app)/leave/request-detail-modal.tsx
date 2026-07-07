"use client";

import { useState, useTransition } from "react";
import { CalendarX, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/providers";
import { cancelLeaveAction } from "@/server/actions/cancel-leave";
import { requestLeaveCancellationAction } from "@/server/actions/cancel-approved-leave";
import type { MyRequest } from "@/server/employee/requests";
import { PENDING_STATUSES, STATUS_CLS } from "@/app/(app)/leave/leave-status";
import { fmtRange, fmtTimestamp } from "@/app/(app)/leave/leave-format";
import { Row } from "@/app/(app)/leave/detail-row";
import { todayISO } from "@/lib/fy";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";

export function DetailModal({ request, onClose }: { request: MyRequest; onClose: () => void }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const canWithdraw = PENDING_STATUSES.includes(request.status);
  // KAN-127 — a separate flow: withdrawing a still-pending request (above) never
  // touches a balance; requesting cancellation of an already-approved one might,
  // and may need the approver's sign-off (server-side policy decides which).
  const canRequestCancellation = request.status === "approved" && request.from > todayISO();
  const cancellationPending = request.status === "cancellation_requested";

  useEscapeKey(onClose);

  function cancelRequest() {
    startTransition(async () => {
      const res = await cancelLeaveAction({ requestId: request.id });
      if (!res.ok) {
        flash(res.error ?? "Could not cancel the request", "warn");
        return;
      }
      flash("Request cancelled", "ok");
      onClose();
    });
  }

  function requestCancellation() {
    startTransition(async () => {
      const res = await requestLeaveCancellationAction({ requestId: request.id });
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Request detail"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]">{request.typeLabel}</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {request.typeCode}
              {request.halfDay ? " · Half-day" : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4 text-[13px]">
          <Row label="Status">
            <StatusPill label={request.statusLabel} className={STATUS_CLS[request.status] ?? "bg-muted text-muted-foreground"} />
          </Row>
          <Row label="Dates">{fmtRange(request.from, request.to)}</Row>
          <Row label="Working days">{request.days}</Row>
          <Row label="Team Lead (L1)">{request.teamLeadName ?? "—"}</Row>
          <Row label="Project Manager (L2)">{request.projectManagerName ?? "—"}</Row>
          <Row label="Applied on">{fmtTimestamp(request.createdAt)}</Row>
          <div>
            <div className="text-muted-foreground">Reason</div>
            <p className="mt-1 leading-relaxed whitespace-pre-wrap">
              {request.reason?.trim() || "—"}
            </p>
          </div>
        </div>

        {canWithdraw && !confirming && (
          <div className="border-t border-border px-5 py-4">
            <Button
              variant="destructive-outline"
              onClick={() => setConfirming(true)}
              className="w-full hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Cancel request
            </Button>
          </div>
        )}

        {canWithdraw && confirming && (
          <div className="border-t border-border px-5 py-4">
            <div className="flex flex-col gap-2.5">
              <p className="text-[12.5px] text-muted-foreground">
                Cancel this pending request? This can&apos;t be undone.
              </p>
              <div className="flex gap-2.5">
                <Button
                  onClick={cancelRequest}
                  disabled={pending}
                  className="flex-1 bg-destructive text-white hover:bg-destructive/90"
                >
                  {pending ? "Cancelling…" : "Yes, cancel request"}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                  Keep it
                </Button>
              </div>
            </div>
          </div>
        )}

        {canRequestCancellation && !confirming && (
          <div className="border-t border-border px-5 py-4">
            <Button
              variant="destructive-outline"
              onClick={() => setConfirming(true)}
              className="w-full hover:bg-destructive/10"
            >
              <CalendarX className="size-4" />
              Request cancellation
            </Button>
          </div>
        )}

        {canRequestCancellation && confirming && (
          <div className="border-t border-border px-5 py-4">
            <div className="flex flex-col gap-2.5">
              <p className="text-[12.5px] text-muted-foreground">
                This leave is already approved. Your manager may need to approve the cancellation before{" "}
                {request.days > 0 ? `${request.days} day(s) are restored to your balance.` : "it takes effect."}
              </p>
              <div className="flex gap-2.5">
                <Button
                  onClick={requestCancellation}
                  disabled={pending}
                  className="flex-1 bg-destructive text-white hover:bg-destructive/90"
                >
                  {pending ? "Requesting…" : "Request cancellation"}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                  Keep it
                </Button>
              </div>
            </div>
          </div>
        )}

        {cancellationPending && (
          <div className="flex items-center gap-2.5 border-t border-border bg-violet-600/[0.06] px-5 py-4 text-[12.5px] text-violet-600">
            <CalendarX className="size-4 shrink-0" strokeWidth={2} />
            Cancellation requested — awaiting your approver&apos;s decision.
          </div>
        )}
      </div>
    </div>
  );
}
