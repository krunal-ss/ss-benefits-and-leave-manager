import { requireAccess } from "@/server/auth/current-user";
import { listThresholds } from "@/server/hr/staffing-thresholds";
import { StaffingThresholdsClient } from "./staffing-thresholds-client";

export const metadata = { title: "Staffing thresholds · SmartSense" };

// KAN-74 — HR/Admin config screen for the Smart Team Availability & Capacity
// Planner epic's minimum-staffing threshold. Server Component, HR/admin-gated
// via requireAccess; loads the org default + department overrides and hands
// them to a client form that persists changes through saveStaffingThresholdAction.
export default async function StaffingThresholdsPage() {
  await requireAccess("/settings/staffing-thresholds");
  const { orgDefault, departmentOverrides } = await listThresholds();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Staffing thresholds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the minimum percentage of a team that must stay available. Approvers will see a
          warning before approving leave/WFH that would drop a team below this threshold.
        </p>
      </div>
      <StaffingThresholdsClient orgDefault={orgDefault} departmentOverrides={departmentOverrides} />
    </div>
  );
}
