import { requireAccess } from "@/server/auth/current-user";
import { getLeavePolicies, getLeavePolicyDocumentUrl } from "@/server/policy";
import { LeavePolicySettingsForm } from "./leave-policy-settings-form";

export const metadata = { title: "Leave policy content · SmartSense" };

// KAN-187 — HR/Admin config screen for leave-policy content + the PDF. Only
// the DB-backed leave types (CL/SL/EL) are editable here — WFH's card on the
// employee-facing viewer is static content, see src/server/policy.ts.
export default async function LeavePolicySettingsPage() {
  await requireAccess("/settings/leave-policy");
  const policies = await getLeavePolicies();
  const editable = policies.filter((p) => p.editable);
  const hasDocument = Boolean(await getLeavePolicyDocumentUrl());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Leave policy content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit eligibility, carry-forward rules and FAQs shown on the employee Leave policies screen, and manage the
          downloadable policy PDF.
        </p>
      </div>
      <LeavePolicySettingsForm policies={editable} initialHasDocument={hasDocument} />
    </div>
  );
}
