import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getTeamAvailability, type AvailabilityDay } from "@/server/manager/availability";
import { WEEKDAY_NAMES } from "@/server/calendar";
import { cn } from "@/lib/cn";

export const metadata = { title: "Team availability · SmartSense" };

function hrefFor(m: string | null, teamId: string): string | null {
  if (m === null) return null;
  const params = new URLSearchParams();
  params.set("m", m);
  if (teamId) params.set("team", teamId);
  return `/availability?${params.toString()}`;
}

function MonthNavButton({ month, teamId, dir }: { month: string | null; teamId: string; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = dir === "prev" ? "Previous month" : "Next month";
  const base = "flex size-8 items-center justify-center rounded-lg border";
  const href = hrefFor(month, teamId);
  if (!href) {
    return (
      <span aria-disabled className={cn(base, "cursor-not-allowed text-muted-foreground/40")}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(base, "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground")}>
      <Icon className="size-4" strokeWidth={2} />
    </Link>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-[9px] rounded-full", className)} />
      {label}
    </span>
  );
}

/** Text color for the % available figure, banded so the grid reads as a heatmap. */
function pctTextClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
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
  searchParams: Promise<{ m?: string; team?: string }>;
}) {
  const user = await requireAccess("/availability");
  const { m, team } = await searchParams;
  const { weeks, month, monthLabel, prevMonth, nextMonth, thisMonth, fyLabel, headcount, teamId, teamName, teams } =
    await getTeamAvailability(user, m, team);

  const canSwitchTeams = teams.length > 1;

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
          <LegendDot className="bg-emerald-500" label="High (≥80%)" />
          <LegendDot className="bg-amber-500" label="Moderate (50–79%)" />
          <LegendDot className="bg-red-600" label="Low (<50%)" />
          <div className="ml-1.5 flex items-center gap-2">
            <MonthNavButton month={prevMonth} teamId={teamId} dir="prev" />
            <span className="min-w-[124px] text-center text-sm font-semibold">{monthLabel}</span>
            <MonthNavButton month={nextMonth} teamId={teamId} dir="next" />
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
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
