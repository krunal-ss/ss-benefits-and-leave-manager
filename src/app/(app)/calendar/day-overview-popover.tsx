"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CalendarEvent } from "@/server/calendar";
import { cn } from "@/lib/cn";

export type DayOverview = {
  dayLabel: string;
  events: CalendarEvent[];
  top: number;
  left: number;
};

/** Google-Calendar-style "day overview" box floating over the calendar grid, listing every event for one day. */
export function DayOverviewPopover({
  overview,
  onClose,
  onSelectEvent,
}: {
  overview: DayOverview;
  onClose: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`Leaves on ${overview.dayLabel}`}
        style={{ top: overview.top, left: overview.left }}
        className="fixed z-50 w-[240px] max-h-[280px] overflow-y-auto rounded-[10px] border border-border bg-card p-2 shadow-2xl"
      >
        <div className="px-1.5 py-1 text-[11.5px] font-semibold text-muted-foreground">{overview.dayLabel}</div>
        <div className="flex flex-col gap-1">
          {overview.events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => onSelectEvent(ev)}
              className={cn(
                "flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-left transition-colors hover:bg-accent",
                ev.kind === "leave" ? "text-blue-600" : "text-violet-600",
              )}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", ev.kind === "leave" ? "bg-blue-600" : "bg-violet-600")} />
              <span className="truncate text-[12px] font-medium">{ev.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
