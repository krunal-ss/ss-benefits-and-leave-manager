// KAN-206 — Public Holiday Countdown. Pure presentational Server Component;
// no client state needed since the countdown is derived fresh on every
// render from `todayISO()` (matches the "updates daily" acceptance criterion).
import { PartyPopper } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { HolidayCountdown } from "@/server/employee/holiday-countdown";

function daysUntilLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

export function HolidayCountdownWidget({ data }: { data: HolidayCountdown }) {
  return (
    <Card className="flex items-center gap-3.5 rounded-[14px] px-4 py-3.5">
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <PartyPopper className="size-[18px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">
          Next public holiday: <span className="font-semibold">{data.name}</span>
        </div>
        <div className="text-xs text-muted-foreground">{data.dateLabel}</div>
      </div>
      <span className="ml-auto inline-flex h-6 shrink-0 items-center rounded-full bg-amber-500/15 px-2.5 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
        {daysUntilLabel(data.daysUntil)}
      </span>
    </Card>
  );
}
