import { Card } from "@/components/ui/card";
import type { CapacitySummary } from "@/server/manager/capacity-summary";
import { cn } from "@/lib/cn";
import { formatCount, formatDayLabel, pctTextClass } from "@/app/(app)/availability/availability-format";

/** KAN-76: % available / on-leave / WFH card for "today" or the clicked date. */
export function CapacitySummaryCard({ title, summary }: { title: string; summary: CapacitySummary }) {
  const isWorking = summary.isWorkingDay && summary.availablePct !== null;
  return (
    <Card
      role="group"
      aria-label={`${title} capacity summary`}
      className="flex flex-col gap-1.5 rounded-xl px-[18px] py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground">{formatDayLabel(summary.date)}</span>
      </div>
      {isWorking ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className={cn("tabular text-2xl font-semibold tracking-[-0.01em]", pctTextClass(summary.availablePct!))}>
              {summary.availablePct}%
            </span>
            <span className="text-[12.5px] text-muted-foreground">available</span>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{formatCount(summary.onLeaveCount)} on leave</span>
            <span className="font-medium text-violet-600">{summary.wfhCount} WFH</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-0.5 py-0.5">
          <span className="text-base font-semibold text-muted-foreground">
            {summary.holidayName || "Non-working day"}
          </span>
          <span className="text-xs text-muted-foreground">Excluded from the capacity calc</span>
        </div>
      )}
    </Card>
  );
}
