"use client";

// KAN-74 — Client shell for the staffing-thresholds config screen: the
// org-wide default (single row, edited in place) plus a table of per-department
// overrides (create/edit via a drawer). Mirrors the admin console's
// list+drawer CRUD pattern (src/app/(app)/admin/admin-console.tsx).
import type { StaffingThresholdRow } from "@/server/hr/staffing-thresholds";
import { OrgDefaultCard } from "@/app/(app)/settings/staffing-thresholds/org-default-card";
import { DepartmentOverridesCard } from "@/app/(app)/settings/staffing-thresholds/department-overrides-card";

export function StaffingThresholdsClient({
  orgDefault,
  departmentOverrides,
}: {
  orgDefault: StaffingThresholdRow | null;
  departmentOverrides: StaffingThresholdRow[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <OrgDefaultCard orgDefault={orgDefault} />
      <DepartmentOverridesCard overrides={departmentOverrides} />
    </div>
  );
}
