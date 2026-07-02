import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getDepartmentOverview, type DepartmentAvailabilityRow } from "@/server/hr/department-overview";
import { cn } from "@/lib/cn";

export const metadata = { title: "Departments · SmartSense" };

// KAN-78 — HR Head/Admin org-wide availability overview, grouped by
// users.department. Server Component, gated via requireAccess. Figures are
// the same day-level capacity calc the manager heatmap (KAN-75/76) and
// staffing guard (KAN-77) use — see src/server/hr/department-overview.ts —
// just grouped across the whole org instead of one manager's reports.
//
// "Drilling into a department" hands HR the Team Lead/Project Manager(s) in
// that department, each linking straight into the existing per-manager
// heatmap (/availability?team=<id>) rather than inventing a new
// department-scoped filter on that page.

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Text color for the % available figure, same bands as the availability heatmap. */
function pctTextClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

function StatusBadge({ row }: { row: DepartmentAvailabilityRow }) {
  if (row.availablePct === null) {
    return (
      <span className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
        Non-working day
      </span>
    );
  }
  if (row.belowThreshold) {
    return (
      <span className="rounded-full bg-red-600/10 px-2.5 py-1 text-[11.5px] font-medium text-red-600">At risk</span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-600">OK</span>
  );
}

function DepartmentRow({ row }: { row: DepartmentAvailabilityRow }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3 text-[13px] font-medium">{row.department}</td>
      <td className="px-4 py-3 text-[13px] tabular text-muted-foreground">{row.headcount}</td>
      <td className="px-4 py-3 text-[13px]">
        {row.availablePct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex items-baseline gap-1.5">
            <span className={cn("font-semibold tabular", pctTextClass(row.availablePct))}>{row.availablePct}%</span>
            <span className="text-[11.5px] text-muted-foreground">
              {row.availableCount}/{row.headcount} available
            </span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-[13px] text-muted-foreground">
        {row.thresholdPercent === null
          ? "Not configured"
          : `${row.thresholdPercent}% (${row.thresholdSource === "department" ? "override" : "org default"})`}
      </td>
      <td className="px-4 py-3">
        <StatusBadge row={row} />
      </td>
      <td className="px-4 py-3">
        {row.managers.length === 0 ? (
          <span className="text-[12.5px] text-muted-foreground">No manager on file</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.managers.map((m) => (
              <Link
                key={m.id}
                href={`/availability?team=${m.id}`}
                className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {m.name} heatmap →
              </Link>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireAccess("/departments");
  const { date: dateParam } = await searchParams;
  const { date, rows } = await getDepartmentOverview(user, dateParam);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Department availability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Org-wide capacity by department for {formatDayLabel(date)} — drill into a department&apos;s manager to see
          their team heatmap.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-1 px-6 py-14 text-center">
          <p className="text-sm font-medium">No departments yet.</p>
          <p className="text-sm text-muted-foreground">Availability appears here once users have a department set.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b text-left text-[11.5px] font-medium text-muted-foreground">
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Headcount</th>
                  <th className="px-4 py-2.5">Available today</th>
                  <th className="px-4 py-2.5">Threshold</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Drill in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DepartmentRow key={row.department} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
