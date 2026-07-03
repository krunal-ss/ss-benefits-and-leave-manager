import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MonthNavButton } from "@/components/ui/month-nav-button";
import { LegendDot } from "@/components/ui/legend-dot";
import { requireAccess } from "@/server/auth/current-user";
import { getTeamAvailability, type AvailabilityDay } from "@/server/manager/availability";
import { getCapacitySummary, type CapacitySummary } from "@/server/manager/capacity-summary";
import { getCapacityForecast } from "@/server/manager/capacity-forecast";
import { CapacityForecastChart } from "./capacity-forecast-chart";
import { WEEKDAY_NAMES } from "@/server/calendar";
import { todayISO } from "@/lib/fy";
import { cn } from "@/lib/cn";
import { formatDayLabel, pctTextClass } from "@/app/(app)/availability/availability-format";
import { CapacitySummaryCard } from "@/app/(app)/availability/capacity-summary-card";

export const metadata = { title: "Team availability · SmartSense" };

function hrefFor(m: string | null, teamId: string): string | null {
  if (m === null) return null;
  const params = new URLSearchParams();
  params.set("m", m);
  if (teamId) params.set("team", teamId);
  return `/availability?${params.toString()}`;
}

/** Href for selecting a specific day cell — keeps the current month/team, sets `date`. */
function hrefForDate(month: string, teamId: string, date: string): string {
  const params = new URLSearchParams();
  params.set("m", month);
  if (teamId) params.set("team", teamId);
  params.set("date", date);
  return `/availability?${params.toString()}`;
}

/** Cell background tint, same bands as pctTextClass but much lighter. */
function pctBgClass(pct: number): string {
  if (pct >= 80) return "bg-emerald-500/[0.08]";
  if (pct >= 50) return "bg-amber-500/[0.10]";
  return "bg-red-600/[0.10]";
}

function dayBg(d: AvailabilityDay): string {
  if (!d.inMonth) return "bg-muted";
  if (d.isHoliday) return "bg-amber-500/[0.09]";
  if (d.isWeekend) return "bg-muted/55";
  if (d.availablePct === null) return "bg-card"; // e.g. no headcount yet
  return pctBgClass(d.availablePct);
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; team?: string; date?: string }>;
}) {
  const user = await requireAccess("/availability");
  const { m, team, date } = await searchParams;
  // KAN-79: the forecast is independent of the month grid (always a rolling
  // window starting today) — fetched alongside it rather than blocking on it.
  const [availability, forecast] = await Promise.all([
    getTeamAvailability(user, m, team),
    getCapacityForecast(user, team),
  ]);
  const { weeks, month, monthLabel, prevMonth, nextMonth, thisMonth, fyLabel, headcount, teamId, teamName, teams } =
    availability;

  const canSwitchTeams = teams.length > 1;
  const todayIso = todayISO();

  // KAN-76: capacity summary widget for "today" and whatever date is
  // currently selected (a clicked day cell, via the `date` param). Both are
  // shaped from AvailabilityDay rows getTeamAvailability already computed —
  // no separate capacity calc here.
  const inMonthDates = new Set(weeks.flatMap((w) => w.days.filter((d) => d.inMonth).map((d) => d.date)));
  const requestedDate = date && inMonthDates.has(date) ? date : undefined;
  const firstInMonthDate = weeks.flatMap((w) => w.days).find((d) => d.inMonth)?.date;
  const selectedDate = requestedDate ?? (inMonthDates.has(todayIso) ? todayIso : firstInMonthDate);

  let todaySummary: CapacitySummary | null = null;
  if (headcount > 0) {
    if (inMonthDates.has(todayIso)) {
      todaySummary = getCapacitySummary(weeks, todayIso);
    } else if (thisMonth) {
      // Viewing a month other than the current one — fetch just the current
      // month's view (same team) so "today" is always available.
      const todayView = await getTeamAvailability(user, thisMonth, teamId);
      todaySummary = getCapacitySummary(todayView.weeks, todayIso);
    }
  }
  const isTodaySelected = selectedDate === todayIso;
  const selectedSummary =
    headcount > 0 && selectedDate ? (isTodaySelected ? todaySummary : getCapacitySummary(weeks, selectedDate)) : null;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Team availability</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capacity &amp; coverage for {teamName || "the team"} · FY {fyLabel}.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3.5">
          <LegendDot shape="circle" className="bg-emerald-500" label="High (≥80%)" />
          <LegendDot shape="circle" className="bg-amber-500" label="Moderate (50–79%)" />
          <LegendDot shape="circle" className="bg-red-600" label="Low (<50%)" />
          <div className="ml-1.5 flex items-center gap-2">
            <MonthNavButton href={hrefFor(prevMonth, teamId)} dir="prev" />
            <span className="min-w-[124px] text-center text-sm font-semibold">{monthLabel}</span>
            <MonthNavButton href={hrefFor(nextMonth, teamId)} dir="next" />
            {thisMonth && (
              <Link
                href={hrefFor(thisMonth, teamId) ?? "/availability"}
                className="ml-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                This month
              </Link>
            )}
          </div>
        </div>
      </div>

      {canSwitchTeams && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Team:</span>
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/availability?m=${month}&team=${t.id}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                t.id === teamId
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {headcount > 0 && todaySummary && (
        <div className={cn("grid gap-3.5", !isTodaySelected && selectedSummary ? "grid-cols-2 sm:max-w-xl" : "grid-cols-1 sm:max-w-[280px]")}>
          <CapacitySummaryCard title="Today" summary={todaySummary} />
          {!isTodaySelected && selectedSummary && (
            <CapacitySummaryCard title="Selected day" summary={selectedSummary} />
          )}
        </div>
      )}

      {forecast.headcount > 0 && forecast.points.length > 0 && (
        <Card className="flex flex-col gap-3 rounded-xl px-[18px] py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Capacity forecast</h2>
            <p className="text-xs text-muted-foreground">
              Next {forecast.windowDays} days ({formatDayLabel(forecast.startDate)} – {formatDayLabel(forecast.endDate)}) for{" "}
              {forecast.teamName || "the team"} — plan around known future gaps before they&apos;re confirmed.
            </p>
          </div>
          <CapacityForecastChart points={forecast.points} />
        </Card>
      )}

      {headcount === 0 ? (
        <Card className="flex flex-col items-center gap-1 px-6 py-14 text-center">
          <p className="text-sm font-medium">No direct reports on this team yet.</p>
          <p className="text-sm text-muted-foreground">
            Availability appears here once employees&apos; reporting line points to {teamName || "this manager"}.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">
              {headcount} direct report{headcount === 1 ? "" : "s"}
            </span>
          </div>
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
                const cellClass = cn(
                  "flex min-h-24 flex-col gap-1.5 border-r px-[9px] py-2 last:border-r-0",
                  dayBg(d),
                  d.inMonth && "transition-colors hover:bg-accent/40",
                  d.date === selectedDate && "ring-2 ring-inset ring-blue-600",
                );
                const cellBody = (
                  <>
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

                    {d.inMonth && !d.isWeekend && !d.isHoliday && d.availablePct !== null && (
                      <>
                        <span className={cn("text-[15px] font-semibold leading-none", pctTextClass(d.availablePct))}>
                          {d.availablePct}%
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {d.availableCount}/{d.headcount} available
                        </span>
                        {d.onWfh > 0 && (
                          <span className="text-[10.5px] font-medium text-violet-600">
                            {d.onWfh} WFH
                          </span>
                        )}
                      </>
                    )}
                  </>
                );

                // KAN-76: in-month cells are clickable — select the day to
                // populate the "Selected day" capacity summary card above.
                return d.inMonth ? (
                  <Link
                    key={di}
                    href={hrefForDate(month, teamId, d.date)}
                    aria-current={d.date === selectedDate ? "date" : undefined}
                    className={cn(cellClass, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                  >
                    {cellBody}
                  </Link>
                ) : (
                  <div key={di} className={cellClass}>
                    {cellBody}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
