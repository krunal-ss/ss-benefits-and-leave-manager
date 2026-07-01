import { requireAccess } from "@/server/auth/current-user";
import { loadApprovalPolicy } from "@/server/policy/settings";
import { ApprovalPolicyForm } from "./approval-policy-form";

export const metadata = { title: "Approval policy · SmartSense" };

// KAN-46 — HR/Admin config screen for the approval-policy engine. Server Component,
// HR/admin-gated via requireAccess; loads the active policy and hands it to a
// client form that persists changes through saveApprovalPolicyAction.
export default async function ApprovalSettingsPage() {
  await requireAccess("/settings/approvals");
  const policy = await loadApprovalPolicy();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Approval policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how leave &amp; WFH requests are routed and who is copied on notifications.
          Applies to new requests going forward.
        </p>
      </div>
      <ApprovalPolicyForm policy={policy} />
    </div>
  );
}
