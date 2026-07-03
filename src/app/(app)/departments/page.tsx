import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getDepartmentOverview, listDepartmentNames } from "@/server/hr/department-overview";
import { DepartmentRow } from "@/app/(app)/departments/department-row";
import { DepartmentFilterBar } from "@/app/(app)/departments/department-filter-bar";
import { listLeaveTypes } from "@/server/admin/data";
import { roleEnum } from "@/db/schema";
import type { AppRole } from "@/server/auth/rbac";

export const metadata = { title: "Departments · SmartSense" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
//
// KAN-80 adds role/department/leave-type filters (narrowing the same query)
// plus a per-row "Export CSV" (single-day, matching the applied filters).

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; role?: string; leaveType?: string; department?: string }>;
}) {
  const user = await requireAccess("/departments");
  const { date: dateParam, role, leaveType, department } = await searchParams;

  const roleFilter = role && (roleEnum.enumValues as readonly string[]).includes(role) ? (role as AppRole) : undefined;
  const leaveTypeFilter = leaveType && UUID.test(leaveType) ? leaveType : undefined;
  const filters = { role: roleFilter, leaveTypeId: leaveTypeFilter, department: department || undefined };

  const [{ date, rows }, departments, leaveTypes] = await Promise.all([
    getDepartmentOverview(user, dateParam, filters),
    listDepartmentNames(),
    listLeaveTypes(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Department availability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Org-wide capacity by department for {formatDayLabel(date)} — drill into a department&apos;s manager to see
          their team heatmap.
        </p>
      </div>

      <DepartmentFilterBar
        departments={departments}
        leaveTypes={leaveTypes.map((t) => ({ id: t.id, name: t.name }))}
        role={roleFilter ?? ""}
        leaveTypeId={leaveTypeFilter ?? ""}
        department={department ?? ""}
      />

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-1 px-6 py-14 text-center">
          <p className="text-sm font-medium">No departments yet.</p>
          <p className="text-sm text-muted-foreground">Availability appears here once users have a department set.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b text-left text-[11.5px] font-medium text-muted-foreground">
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Headcount</th>
                  <th className="px-4 py-2.5">Available today</th>
                  <th className="px-4 py-2.5">Threshold</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Drill in</th>
                  <th className="px-4 py-2.5">Export</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <DepartmentRow key={row.department} row={row} date={date} role={roleFilter} leaveTypeId={leaveTypeFilter} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
