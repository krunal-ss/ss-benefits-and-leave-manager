import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getDepartmentOverview } from "@/server/hr/department-overview";
import { DepartmentRow } from "@/app/(app)/departments/department-row";

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
