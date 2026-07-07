"use client";

import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import type { CalendarEvent } from "@/server/calendar";
import { LevelRow } from "@/app/(app)/calendar/level-row";

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
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function LeaveDetailModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  useEscapeKey(onClose);

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
