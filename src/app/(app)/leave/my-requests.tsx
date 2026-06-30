"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarDays, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
import { cancelLeaveAction } from "@/server/actions/cancel-leave";
import { cn } from "@/lib/cn";
import type { MyRequest } from "@/server/employee/requests";

const PENDING_STATUSES = ["applied", "pending_l1", "pending_l2"];

const STATUS_CLS: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-500",
  pending_l1: "bg-amber-500/15 text-amber-700",
  pending_l2: "bg-amber-500/15 text-amber-700",
  applied: "bg-amber-500/15 text-amber-700",
  rejected: "bg-red-500/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-2 text-[11.5px] font-medium",
        STATUS_CLS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtRange(from: string, to: string): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
}
function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MyRequests({ requests }: { requests: MyRequest[] }) {
  const [active, setActive] = useState<MyRequest | null>(null);

  return (
    <div className="max-w-[980px]">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">My leave / WFH requests</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted-foreground">
        Everything you&apos;ve applied for. Click a row for the full detail.
      </p>

      <Card className="overflow-hidden p-0">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <CalendarDays className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <div className="text-sm font-medium">No requests yet</div>
            <div className="text-[13px] text-muted-foreground">
              Your leave and WFH applications will show up here.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Dates</th>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Applied on</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setActive(r)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActive(r);
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.typeLabel}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {r.typeCode}
                        {r.halfDay ? " · Half-day" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtRange(r.from, r.to)}</td>
                    <td className="px-4 py-3 tabular-nums">{r.days}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} label={r.statusLabel} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {fmtDate(r.createdAt.slice(0, 10))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active && <DetailModal request={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function DetailModal({ request, onClose }: { request: MyRequest; onClose: () => void }) {
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
            <StatusPill status={request.status} label={request.statusLabel} />
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
