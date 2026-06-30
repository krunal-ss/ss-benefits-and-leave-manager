import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getTeamCalendar, type DayCell, WEEKDAY_NAMES } from "@/server/calendar";
import { cn } from "@/lib/cn";

export const metadata = { title: "Team calendar · SmartSense" };

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-[9px] rounded-sm", className)} />
      {label}
    </span>
  );
}

function dayBg(d: DayCell): string {
  if (!d.inMonth) return "bg-muted";
  if (d.isHoliday) return "bg-amber-500/[0.09]";
  if (d.isWeekend) return "bg-muted/55";
  return "bg-card";
}

export default async function CalendarPage() {
  const user = await requireAccess("/calendar");
  const { weeks, monthLabel } = await getTeamCalendar(user);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Team calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who&apos;s on leave or working from home across the team.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3.5">
          <LegendDot className="bg-blue-600" label="Leave" />
          <LegendDot className="bg-violet-600" label="WFH" />
          <LegendDot className="bg-amber-500" label="Holiday" />
          <span className="ml-1.5 text-sm font-semibold">{monthLabel}</span>
        </div>
      </div>

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
            {wk.days.map((d, di) => (
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
                {d.events.map((ev, ei) => (
                  <div
                    key={ei}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[5px] px-1.5 py-0.5",
                      ev.kind === "leave" ? "bg-blue-600/[0.13]" : "bg-violet-600/[0.14]",
                    )}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", ev.kind === "leave" ? "bg-blue-600" : "bg-violet-600")} />
                    <span className={cn("truncate text-[10.5px] font-medium", ev.kind === "leave" ? "text-blue-600" : "text-violet-600")}>
                      {ev.label}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}
