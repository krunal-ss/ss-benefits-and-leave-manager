import "server-only";
// KAN-78: HR department-wide availability overview — an org-wide aggregate
// grouped by `users.department` (free text, no normalized team table), for
// the HR Head/Admin to spot org-wide staffing risk without opening every
// manager's individual heatmap.
//
// Reuses the exact same day-level capacity calc as the manager heatmap
// (KAN-75/76) and the staffing guard (KAN-77) — getAvailabilityForRange in
// ./manager/availability — grouped by department instead of by one manager's
// direct reports. Each department's current capacity is compared against its
// applicable KAN-74 threshold (department override wins over the org default,
// same resolution order as the staffing guard) so HR can see who's at risk,
// not just raw numbers.
//
// "Drilling into a department" does not invent a new department-scoped
// heatmap: it hands HR the Team Lead/Project Manager(s) who belong to that
// department, each linking straight into the existing per-manager heatmap
// (`/availability?team=<managerId>`) — departments aren't a queryable
// dimension on that page today, and composing with what already exists is a
// smaller, more consistent change than adding one.
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { assertCan } from "@/server/auth/rbac";
import { listThresholds } from "@/server/hr/staffing-thresholds";
import { getAvailabilityForRange } from "@/server/manager/availability";
import { todayISO } from "@/lib/fy";

const MANAGER_ROLES = new Set(["team_lead", "project_manager"]);

export type DepartmentManager = { id: string; name: string };

export type DepartmentAvailabilityRow = {
  /** Department name, or "Unassigned" for users with no department set (matches src/server/hr/reports.ts's convention). */
  department: string;
  headcount: number;
  availableCount: number;
  /** Rounded 0-100, or null on a non-working day / zero headcount. */
  availablePct: number | null;
  isWorkingDay: boolean;
  /** The threshold applicable to this department (its own override, else the org default), or null if neither is configured. */
  thresholdPercent: number | null;
  thresholdSource: "department" | "org" | null;
  /** True only when availablePct and thresholdPercent are both known and availablePct is below it. */
  belowThreshold: boolean;
  /** Team Lead/Project Manager(s) in this department — drill-in links to the existing per-manager heatmap. */
  managers: DepartmentManager[];
};

export type DepartmentOverview = {
  /** ISO yyyy-mm-dd the figures are computed for. */
  date: string;
  rows: DepartmentAvailabilityRow[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Org-wide availability grouped by department, for `date` (defaults to
 * today). HR Head/Admin only — throws for any other role so this can never
 * leak into a manager's own scoped view.
 */
export async function getDepartmentOverview(user: User, dateParam?: string): Promise<DepartmentOverview> {
  assertCan(user.role, "viewDepartmentOverview");

  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : todayISO();
  const db = getDb();

  const allUsers = await db
    .select({ id: users.id, name: users.name, role: users.role, department: users.department })
    .from(users);

  const byDept = new Map<string, { id: string; name: string; role: string }[]>();
  for (const u of allUsers) {
    const department = u.department?.trim() || "Unassigned";
    const list = byDept.get(department) ?? [];
    list.push({ id: u.id, name: u.name, role: u.role });
    byDept.set(department, list);
  }

  const { orgDefault, departmentOverrides } = await listThresholds();
  const overrideByDept = new Map(departmentOverrides.map((o) => [o.scopeValue ?? "", o.minAvailablePercent]));

  const departments = [...byDept.keys()].sort((a, b) => a.localeCompare(b));

  const rows: DepartmentAvailabilityRow[] = [];
  for (const department of departments) {
    const members = byDept.get(department)!;
    const ids = members.map((m) => m.id);

    // Single-day range — same shared day-level calc the heatmap and staffing
    // guard use, just scoped to this department's users instead of one
    // manager's reports.
    const [day] = await getAvailabilityForRange(ids, date, date);

    const overridePercent = overrideByDept.get(department);
    const hasOverride = overridePercent !== undefined;
    const thresholdPercent = hasOverride ? overridePercent : (orgDefault?.minAvailablePercent ?? null);
    const thresholdSource: "department" | "org" | null = hasOverride ? "department" : orgDefault ? "org" : null;
    const belowThreshold =
      day.availablePct !== null && thresholdPercent !== null && day.availablePct < thresholdPercent;

    const managers = members
      .filter((m) => MANAGER_ROLES.has(m.role))
      .map((m) => ({ id: m.id, name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    rows.push({
      department,
      headcount: ids.length,
      availableCount: day.availableCount,
      availablePct: day.availablePct,
      isWorkingDay: day.isWorkingDay,
      thresholdPercent,
      thresholdSource,
      belowThreshold,
      managers,
    });
  }

  return { date, rows };
}
