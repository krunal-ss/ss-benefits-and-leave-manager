import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock, Dumbbell, FileText, GraduationCap, type LucideIcon, Plus, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { available, type Category } from "@/server/benefits";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDashboardData } from "@/server/employee/dashboard";
import { getReminderBannerData } from "@/server/employee/reminder-banner";
import { getRecentActivity, type ActivityType } from "@/server/employee/activity-feed";
import { getNextHoliday } from "@/server/employee/holiday-countdown";
import { currentFy } from "@/lib/fy";
import { formatINR } from "@/lib/format";
import { ReminderBanner } from "./reminder-banner";
import { HolidayCountdownWidget } from "./holiday-countdown-widget";

// KAN-186 — compact preview on the dashboard; the full filterable feed lives at /activity.
const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = { leave: CalendarDays, claim: FileText, wallet: Wallet };

export const metadata = { title: "Dashboard · SmartSense" };

const ACCENTS: Record<Category["key"], { icon: LucideIcon; text: string; bg: string; bar: string }> = {
  sports: { icon: Dumbbell, text: "text-emerald-500", bg: "bg-emerald-500/15", bar: "bg-emerald-500" },
  learning: { icon: GraduationCap, text: "text-blue-600", bg: "bg-blue-600/15", bar: "bg-blue-600" },
};

function BenefitCard({ category }: { category: Category }) {
  const { icon: Icon, text, bg, bar } = ACCENTS[category.key];
  const avail = available(category);
  const approvedPct = category.cap ? Math.round((category.approved / category.cap) * 100) : 0;
  const pendingPct = category.cap ? Math.round((category.pending / category.cap) * 100) : 0;

  return (
    <Card className="flex flex-col gap-3.5 px-[22px] py-5">
      <div className="flex items-center gap-2.5">
        <span className={`flex size-[34px] items-center justify-center rounded-[9px] ${bg} ${text}`}>
          <Icon className="size-[18px]" strokeWidth={2} />
        </span>
        <div>
          <div className="text-sm font-semibold">{category.label}</div>
          <div className="text-xs text-muted-foreground">Annual cap {formatINR(category.cap)}</div>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">Available</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[30px] font-semibold tracking-[-0.02em]">{formatINR(avail)}</span>
        <span className="text-[13px] text-muted-foreground">of {formatINR(category.cap)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className={bar} style={{ width: `${approvedPct}%` }} />
        <div className="bg-amber-500" style={{ width: `${pendingPct}%` }} />
      </div>
      <div className="flex gap-[18px] text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-2 rounded-sm ${bar}`} />
          Used {formatINR(category.approved)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-amber-500" />
          Reserved {formatINR(category.pending)}
        </span>
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await getDashboardData(user.id);
  const reminderBanner = await getReminderBannerData(user.id);
  const recentActivity = (await getRecentActivity(user.id, currentFy().label)).slice(0, 5);
  const nextHoliday = await getNextHoliday(user.location);
  const first = user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Welcome back, {first}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s your benefit wallet and time-off at a glance.
          </p>
        </div>
        <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-[11px] text-[12.5px] text-muted-foreground">
          <Clock className="size-[13px]" />
          {data.fyLabel}
        </span>
      </div>

      {nextHoliday && <HolidayCountdownWidget data={nextHoliday} />}

      {reminderBanner && <ReminderBanner data={reminderBanner} />}

      <div className="grid grid-cols-2 gap-[18px]">
        {data.categories.map((c) => (
          <BenefitCard key={c.key} category={c} />
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3.5">
        {data.leaveCards.map((lc) => (
          <Card key={lc.label} className="flex flex-col gap-1 rounded-xl px-[18px] py-4">
            <div className="text-[12.5px] text-muted-foreground">{lc.label}</div>
            <div className="tabular text-2xl font-semibold tracking-[-0.01em]">
              {lc.value}
              <span className="text-[13px] font-normal text-muted-foreground"> {lc.unit}</span>
            </div>
            <div className="text-xs text-muted-foreground">{lc.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-[18px]">
        <Card className="overflow-hidden">
          <div className="flex items-center border-b px-5 py-4">
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.01em]">Recent claims</div>
              <div className="text-[12.5px] text-muted-foreground">Your latest benefit submissions</div>
            </div>
            <Link
              href="/submit"
              className="ml-auto inline-flex h-[30px] items-center rounded-[7px] border bg-background px-[11px] text-[12.5px] font-medium shadow-xs hover:bg-accent"
            >
              New claim
            </Link>
          </div>
          {data.recentClaims.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
              No claims yet — submit your first expense.
            </div>
          ) : (
            data.recentClaims.map((rc, i) => (
              <div key={`${rc.vendor}-${i}`} className="flex items-center gap-3 border-b px-5 py-[13px] last:border-b-0">
                <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-[15px]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">{rc.vendor}</div>
                  <div className="text-xs text-muted-foreground">
                    {rc.category} · {rc.date}
                  </div>
                </div>
                <div className="ml-auto flex flex-col items-end gap-1.5 text-right">
                  <span className="tabular text-[13.5px] font-semibold">{formatINR(rc.amount)}</span>
                  <StatusBadge status={rc.status} />
                </div>
              </div>
            ))
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-5 py-4">
            <div className="text-[15px] font-semibold tracking-[-0.01em]">Upcoming time off</div>
            <div className="text-[12.5px] text-muted-foreground">Approved &amp; pending</div>
          </div>
          {data.upcoming.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-muted-foreground">Nothing scheduled.</div>
          ) : (
            data.upcoming.map((up, i) => (
              <div key={`${up.title}-${i}`} className="flex items-center gap-3 border-b px-5 py-[13px]">
                <span className={`size-[9px] shrink-0 rounded-full ${up.dot === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{up.title}</div>
                  <div className="text-xs text-muted-foreground">{up.dates}</div>
                </div>
                <span className="ml-auto text-[11.5px] font-medium text-muted-foreground">{up.status}</span>
              </div>
            ))
          )}
          <div className="px-5 py-3.5">
            <Link
              href="/leave"
              className="flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border bg-background text-[13px] font-medium shadow-xs hover:bg-accent"
            >
              <Plus className="size-[15px]" strokeWidth={2} />
              Apply for leave / WFH
            </Link>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center border-b px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]">Recent activity</div>
            <div className="text-[12.5px] text-muted-foreground">Your latest updates across leave, claims &amp; benefits</div>
          </div>
          <Link
            href="/activity"
            className="ml-auto inline-flex h-[30px] items-center rounded-[7px] border bg-background px-[11px] text-[12.5px] font-medium shadow-xs hover:bg-accent"
          >
            View all
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">Nothing yet — activity shows up here as you go.</div>
        ) : (
          recentActivity.map((it) => {
            const Icon = ACTIVITY_ICON[it.type];
            return (
              <div key={it.id} className="flex items-center gap-3 border-b px-5 py-[13px] last:border-b-0">
                <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-[15px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{it.detail}</div>
                </div>
                <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground">{it.statusLabel}</span>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
