"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { CalendarEvent, EventApproval } from "@/server/calendar";

const STATUS_CLS: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-500",
  pending_l1: "bg-amber-500/15 text-amber-700",
  pending_l2: "bg-amber-500/15 text-amber-700",
  applied: "bg-amber-500/15 text-amber-700",
};

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
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Sequential-flow approval state for one level, derived from status + the approvals trail. */
function levelState(
  level: 1 | 2,
  status: string,
  approval: EventApproval | undefined,
): "approved" | "rejected" | "pending" | "not-reached" {
  if (approval) return approval.decision;
  if (level === 1) return status === "applied" || status === "pending_l1" ? "pending" : "not-reached";
  return status === "pending_l2" ? "pending" : "not-reached";
}

function LevelRow({
  level,
  roleLabel,
  approverName,
  status,
  approval,
}: {
  level: 1 | 2;
  roleLabel: string;
  approverName: string | null;
  status: string;
  approval: EventApproval | undefined;
}) {
  const state = levelState(level, status, approval);
  const dot =
    state === "approved"
      ? "border-emerald-500 bg-emerald-500 text-white"
      : state === "rejected"
        ? "border-destructive bg-destructive text-white"
        : state === "pending"
          ? "border-amber-500 bg-amber-500 text-white"
          : "border-border bg-muted text-muted-foreground";
  const mark = state === "approved" ? "✓" : state === "rejected" ? "✕" : state === "pending" ? "•" : level;

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
          dot,
        )}
      >
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[13px] font-medium">
            L{level} · {roleLabel}
          </span>
          <span className="text-[12px] text-muted-foreground">{approverName ?? "—"}</span>
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {state === "approved" && `Approved${approval ? ` · ${fmtTimestamp(approval.createdAt)}` : ""}`}
          {state === "rejected" && `Rejected${approval ? ` · ${fmtTimestamp(approval.createdAt)}` : ""}`}
          {state === "pending" && "Awaiting decision"}
          {state === "not-reached" && "Not yet reached"}
        </div>
        {approval?.reason && <p className="mt-1 text-[12px] whitespace-pre-wrap italic">&ldquo;{approval.reason}&rdquo;</p>}
      </div>
    </div>
  );
}

export function LeaveDetailModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const approvalByLevel = (level: 1 | 2) => event.approvals.find((a) => a.level === level);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Leave detail"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar initials={initialsOf(event.employeeName)} className="size-9 text-[13px]" />
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.01em]">{event.employeeName}</div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{event.typeLabel}</div>
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
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Status</span>
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-md px-2 text-[11.5px] font-medium",
                STATUS_CLS[event.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {event.statusLabel}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Dates</span>
            <span className="text-right font-medium">
              {fmtRange(event.from, event.to)}
              {event.halfDay ? " · Half-day" : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Working days</span>
            <span className="text-right font-medium">{event.days}</span>
          </div>
          {event.reason && (
            <div>
              <div className="text-muted-foreground">Reason</div>
              <p className="mt-1 leading-relaxed whitespace-pre-wrap">{event.reason}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3.5">
            <div className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">Approval trail</div>
            <LevelRow
              level={1}
              roleLabel="Team Lead"
              approverName={event.teamLeadName}
              status={event.status}
              approval={approvalByLevel(1)}
            />
            <LevelRow
              level={2}
              roleLabel="Project Manager"
              approverName={event.projectManagerName}
              status={event.status}
              approval={approvalByLevel(2)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
