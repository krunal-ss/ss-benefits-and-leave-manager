// KAN-205/209 — Team Leave Today widget. Server Component: no client state,
// so no "use client" — the data is fetched once server-side per page load,
// which also satisfies the "updates immediately after leave/WFH changes" AC
// (there's nothing stale to invalidate).
import Link from "next/link";
import { CalendarDays, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { TeamAvailabilityToday } from "@/server/team-today";

export function TeamAvailabilityWidget({
  data,
  showCalendarLink,
}: {
  data: TeamAvailabilityToday;
  showCalendarLink: boolean;
}) {
  if (data.headcount === 0) {
    return (
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-4">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Team availability today</div>
          <div className="text-[12.5px] text-muted-foreground">Who&apos;s available, on leave, or WFH</div>
        </div>
        <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
          No team assigned yet.
        </div>
      </Card>
    );
  }

  const pctLabel = data.availablePct === null ? "—" : `${data.availablePct}%`;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center border-b px-5 py-4">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Team availability today</div>
          <div className="text-[12.5px] text-muted-foreground">{data.teamLabel}</div>
        </div>
        {showCalendarLink && (
          <Link
            href="/calendar"
            className="ml-auto inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border bg-background px-[11px] text-[12.5px] font-medium shadow-xs hover:bg-accent"
          >
            <CalendarDays className="size-[13px]" strokeWidth={2} />
            Team calendar
          </Link>
        )}
      </div>

      <div className="px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-[28px] font-semibold tracking-[-0.02em]">{pctLabel}</span>
          <span className="text-[13px] text-muted-foreground">available today</span>
          {!data.isWorkingDay && (
            <span className="ml-auto inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11px] font-medium text-muted-foreground">
              Non-working day
            </span>
          )}
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500" style={{ width: `${data.availablePct ?? 0}%` }} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="tabular text-lg font-semibold">{data.availableCount}</div>
            <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <span className="size-2 rounded-sm bg-emerald-500" />
              Available
            </div>
          </div>
          <div>
            <div className="tabular text-lg font-semibold">{data.onLeaveCount}</div>
            <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <span className="size-2 rounded-sm bg-blue-600" />
              On leave
            </div>
          </div>
          <div>
            <div className="tabular text-lg font-semibold">{data.onWfhCount}</div>
            <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <span className="size-2 rounded-sm bg-violet-600" />
              WFH
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-[13px]" strokeWidth={2} />
          {data.headcount} team member{data.headcount === 1 ? "" : "s"}
        </div>
      </div>
    </Card>
  );
}
