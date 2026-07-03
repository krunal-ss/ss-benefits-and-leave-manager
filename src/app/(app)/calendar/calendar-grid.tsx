"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { CalendarEvent, CalWeek, DayCell } from "@/server/calendar";
import { DayOverviewPopover, type DayOverview } from "./day-overview-popover";
import { LeaveDetailModal } from "./leave-detail-modal";
import { EventPill } from "@/app/(app)/calendar/event-pill";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Google Calendar-style cap: at most 4 events shown inline, the 5th slot becomes "+N more".
const MAX_VISIBLE = 4;

function dayBg(d: DayCell): string {
  if (!d.inMonth) return "bg-muted";
  if (d.isHoliday) return "bg-amber-500/[0.09]";
  if (d.isWeekend) return "bg-muted/55";
  return "bg-card";
}

export function CalendarGrid({ weeks, monthLabel }: { weeks: CalWeek[]; monthLabel: string }) {
  const [overview, setOverview] = useState<DayOverview | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  function openOverview(d: DayCell, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - 256);
    const top = Math.min(rect.bottom + 4, window.innerHeight - 296);
    setOverview({ dayLabel: `${d.day} ${monthLabel}`, events: d.events, top, left });
  }

  function selectEvent(event: CalendarEvent) {
    setOverview(null);
    setSelected(event);
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAY_NAMES.map((wd) => (
          <div key={wd} className="px-3 py-2.5 text-[11.5px] font-medium text-muted-foreground">
            {wd}
          </div>
        ))}
      </div>

      {weeks.map((wk, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {wk.days.map((d, di) => {
            const overflow = d.events.length > MAX_VISIBLE + 1;
            const shown = overflow ? d.events.slice(0, MAX_VISIBLE) : d.events;
            const hiddenCount = overflow ? d.events.length - MAX_VISIBLE : 0;
            return (
              <div
                key={di}
                className={cn("flex min-h-24 flex-col gap-1.5 border-r px-[9px] py-2 last:border-r-0", dayBg(d))}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      !d.inMonth ? "text-muted-foreground" : d.isToday ? "text-blue-600" : "text-foreground",
                    )}
                  >
                    {d.day}
                  </span>
                  {d.isHoliday && (
                    <span className="text-[9.5px] font-semibold tracking-[0.03em] text-amber-500 uppercase">
                      {d.holidayName}
                    </span>
                  )}
                </div>
                {shown.map((ev, ei) => (
                  <EventPill key={ei} event={ev} onClick={() => selectEvent(ev)} />
                ))}
                {hiddenCount > 0 && (
                  <button
                    onClick={(e) => openOverview(d, e)}
                    className="rounded-[5px] px-1.5 py-0.5 text-left text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    +{hiddenCount} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {overview && (
        <DayOverviewPopover overview={overview} onClose={() => setOverview(null)} onSelectEvent={selectEvent} />
      )}
      {selected && <LeaveDetailModal event={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}
