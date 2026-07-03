"use client";

// KAN-80: filter bar (role / department / leave type) for the HR department
// overview, wired via URL search params (same convention as the heatmap's
// filter bar / this page's existing `date` param) so the Server Component
// re-fetches a filtered view.
import { useRouter, useSearchParams } from "next/navigation";
import type { AppRole } from "@/server/auth/rbac";

const fieldCls =
  "h-[30px] rounded-lg border border-input bg-background px-2.5 text-[12.5px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "team_lead", label: "Team Lead" },
  { value: "project_manager", label: "Project Manager" },
  { value: "hr_head", label: "HR Head" },
  { value: "admin", label: "Admin" },
];

export function DepartmentFilterBar({
  departments,
  leaveTypes,
  role,
  leaveTypeId,
  department,
}: {
  departments: string[];
  leaveTypes: { id: string; name: string }[];
  role: string;
  leaveTypeId: string;
  department: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/departments?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-2.5 rounded-xl border bg-card px-3.5 py-3">
      <div>
        <label htmlFor="departmentFilter" className={labelCls}>
          Department
        </label>
        <select
          id="departmentFilter"
          className={fieldCls}
          value={department}
          onChange={(e) => setParam("department", e.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="departmentRoleFilter" className={labelCls}>
          Role
        </label>
        <select
          id="departmentRoleFilter"
          className={fieldCls}
          value={role}
          onChange={(e) => setParam("role", e.target.value)}
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="departmentLeaveTypeFilter" className={labelCls}>
          Leave type
        </label>
        <select
          id="departmentLeaveTypeFilter"
          className={fieldCls}
          value={leaveTypeId}
          onChange={(e) => setParam("leaveType", e.target.value)}
        >
          <option value="">All types</option>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
