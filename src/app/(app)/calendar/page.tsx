import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAccess } from "@/server/auth/current-user";
import { getTeamCalendar } from "@/server/calendar";
import { cn } from "@/lib/cn";
import { CalendarGrid } from "./calendar-grid";

export const metadata = { title: "Team calendar · SmartSense" };

function MonthNavButton({ month, dir }: { month: string | null; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = dir === "prev" ? "Previous month" : "Next month";
  const base = "flex size-8 items-center justify-center rounded-lg border";
  if (!month) {
    return (
      <span aria-disabled className={cn(base, "cursor-not-allowed text-muted-foreground/40")}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
    );
  }
  return (
    <Link href={`/calendar?m=${month}`} aria-label={label} className={cn(base, "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground")}>
      <Icon className="size-4" strokeWidth={2} />
    </Link>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-[9px] rounded-sm", className)} />
      {label}
    </span>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireAccess("/calendar");
  const { m } = await searchParams;
  const { weeks, monthLabel, prevMonth, nextMonth, thisMonth, fyLabel } = await getTeamCalendar(user, m);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Team calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who&apos;s on leave or working from home across the team · FY {fyLabel}.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3.5">
          <LegendDot className="bg-blue-600" label="Leave" />
          <LegendDot className="bg-violet-600" label="WFH" />
          <LegendDot className="bg-amber-500" label="Holiday" />
          <div className="ml-1.5 flex items-center gap-2">
            <MonthNavButton month={prevMonth} dir="prev" />
            <span className="min-w-[124px] text-center text-sm font-semibold">{monthLabel}</span>
            <MonthNavButton month={nextMonth} dir="next" />
            {thisMonth && (
              <Link
                href="/calendar"
                className="ml-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                This month
              </Link>
            )}
          </div>
        </div>
      </div>

      <CalendarGrid weeks={weeks} monthLabel={monthLabel} />
    </div>
  );
}
