import Link from "next/link";
import { MonthNavButton } from "@/components/ui/month-nav-button";
import { LegendDot } from "@/components/ui/legend-dot";
import { requireAccess } from "@/server/auth/current-user";
import { getTeamCalendar } from "@/server/calendar";
import { CalendarGrid } from "./calendar-grid";

export const metadata = { title: "Team calendar · SmartSense" };

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
          <LegendDot shape="square" className="bg-blue-600" label="Leave" />
          <LegendDot shape="square" className="bg-violet-600" label="WFH" />
          <LegendDot shape="square" className="bg-amber-500" label="Holiday" />
          <div className="ml-1.5 flex items-center gap-2">
            <MonthNavButton href={prevMonth ? `/calendar?m=${prevMonth}` : null} dir="prev" />
            <span className="min-w-[124px] text-center text-sm font-semibold">{monthLabel}</span>
            <MonthNavButton href={nextMonth ? `/calendar?m=${nextMonth}` : null} dir="next" />
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
