"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/providers";
import { cancelLeaveAction } from "@/server/actions/cancel-leave";
import type { MyRequest } from "@/server/employee/requests";
import { PENDING_STATUSES, STATUS_CLS } from "@/app/(app)/leave/leave-status";
import { fmtRange, fmtTimestamp } from "@/app/(app)/leave/leave-format";
import { Row } from "@/app/(app)/leave/detail-row";

export function DetailModal({ request, onClose }: { request: MyRequest; onClose: () => void }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const canCancel = PENDING_STATUSES.includes(request.status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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

        {canCancel && (
          <div className="border-t border-border px-5 py-4">
            {confirming ? (
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
            ) : (
              <Button
                variant="destructive-outline"
                onClick={() => setConfirming(true)}
                className="w-full hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                Cancel request
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
