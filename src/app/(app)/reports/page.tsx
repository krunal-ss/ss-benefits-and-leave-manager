import { requireAccess } from "@/server/auth/current-user";
import { getReportData, recentFyLabels } from "@/server/hr/reports";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { FyFilter } from "./fy-filter";
import { BarRow } from "@/app/(app)/reports/bar-row";
import { Stat } from "@/app/(app)/reports/stat";
import { EmptyHint } from "@/app/(app)/reports/empty-hint";

export const metadata = { title: "Reports · SmartSense" };

// HR reporting dashboard (KAN-44). Server Component, HR/admin-gated. All figures
// are live DB aggregates from src/server/hr/reports.ts; money is paise, formatted
// via formatINR. Charts are lightweight CSS bars (no external chart lib).

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; from?: string; to?: string }>;
}) {
  await requireAccess("/reports");
  const sp = await searchParams;
  const data = await getReportData(sp);
  const fyOptions = recentFyLabels(4);
  const activeFy = data.range.fyLabel ?? fyOptions[0];

  const { approval, leave, queues } = data;
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.approvedPaise));
  const maxDept = Math.max(1, ...data.byDepartment.map((d) => d.approvedPaise));
  const maxType = Math.max(1, ...leave.byType.map((t) => t.days));

  const summary = [
    {
      label: "Approved benefit spend",
      value: formatINR(data.totalApprovedPaise / 100),
      sub: `${data.byCategory.reduce((s, c) => s + c.claimCount, 0)} claims`,
      color: "text-foreground",
    },
    {
      label: "Expense approval rate",
      value: pct(approval.approvalRate),
      sub: `${approval.approved} of ${approval.decided} decided`,
      color: "text-emerald-500",
    },
    {
      label: "Auto-approved",
      value: pct(approval.autoApprovalRate),
      sub: `${approval.autoApproved} claims`,
      color: "text-foreground",
    },
    {
      label: "Leave days approved",
      value: String(leave.approvedDays),
      sub: `${leave.approved} requests · ${leave.wfhRequests} WFH`,
      color: "text-foreground",
    },
  ];

  const pendingCards = [
    { label: "Expense — HR review", value: queues.expenseHr },
    { label: "Leave — L1 (Team Lead)", value: queues.leaveL1 },
    { label: "Leave — L2 (Project Manager)", value: queues.leaveL2 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Benefit spend, approval rates and leave activity for the selected financial year.
          </p>
        </div>
        <FyFilter options={fyOptions} value={activeFy} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1 rounded-xl px-[18px] py-4">
            <div className="text-[12.5px] text-muted-foreground">{s.label}</div>
            <div className={cn("tabular text-2xl font-semibold tracking-[-0.01em]", s.color)}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Benefit spend by category */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-[15px] font-semibold">Benefit spend by category</div>
          {data.byCategory.length === 0 ? (
            <EmptyHint>No approved claims in this period.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-3.5">
              {data.byCategory.map((c) => (
                <BarRow
                  key={c.category}
                  label={c.category}
                  value={formatINR(c.approvedPaise / 100)}
                  sub={`/ ${formatINR(c.capPaise / 100)} cap`}
                  fraction={c.approvedPaise / maxCat}
                  tone="bg-foreground"
                />
              ))}
            </div>
          )}
        </Card>

        {/* Benefit spend by department */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-[15px] font-semibold">Benefit spend by department</div>
          {data.byDepartment.length === 0 ? (
            <EmptyHint>No approved claims in this period.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-3.5">
              {data.byDepartment.map((d) => (
                <BarRow
                  key={d.department}
                  label={d.department}
                  value={formatINR(d.approvedPaise / 100)}
                  sub={`${d.claimCount} claim${d.claimCount === 1 ? "" : "s"}`}
                  fraction={d.approvedPaise / maxDept}
                  tone="bg-emerald-500"
                />
              ))}
            </div>
          )}
        </Card>

        {/* Expense approval breakdown */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-[15px] font-semibold">Expense approval outcomes</div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Approved" value={approval.approved} tone="text-emerald-500" />
            <Stat label="Rejected" value={approval.rejected} tone="text-destructive" />
            <Stat label="Pending" value={approval.pending} tone="text-foreground" />
          </div>
          <div className="flex flex-col gap-3.5">
            <BarRow
              label="Approval rate"
              value={pct(approval.approvalRate)}
              fraction={approval.approvalRate}
              tone="bg-emerald-500"
            />
            <BarRow
              label="Auto-approved (of decided)"
              value={pct(approval.autoApprovalRate)}
              fraction={approval.autoApprovalRate}
              tone="bg-foreground"
            />
          </div>
        </Card>

        {/* Leave activity */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="text-[15px] font-semibold">Leave & WFH activity</div>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Total" value={leave.totalRequests} tone="text-foreground" />
            <Stat label="Approved" value={leave.approved} tone="text-emerald-500" />
            <Stat label="Rejected" value={leave.rejected} tone="text-destructive" />
            <Stat label="Pending" value={leave.pending} tone="text-foreground" />
          </div>
          {leave.byType.length === 0 ? (
            <EmptyHint>No approved leave in this period.</EmptyHint>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div className="text-[12.5px] text-muted-foreground">Approved days by leave type</div>
              {leave.byType.map((t) => (
                <BarRow
                  key={t.type}
                  label={t.type}
                  value={`${t.days} day${t.days === 1 ? "" : "s"}`}
                  sub={`${t.requests} req`}
                  fraction={t.days / maxType}
                  tone="bg-foreground"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Pending queues (live, not range-scoped) */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <div className="text-[15px] font-semibold">Pending approval queues</div>
          <span className="text-[11.5px] text-muted-foreground">live · across all periods</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {pendingCards.map((q) => (
            <div key={q.label} className="rounded-[10px] border px-3.5 py-3">
              <div className="text-[11.5px] text-muted-foreground">{q.label}</div>
              <div className="tabular mt-0.5 text-xl font-semibold">{q.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
