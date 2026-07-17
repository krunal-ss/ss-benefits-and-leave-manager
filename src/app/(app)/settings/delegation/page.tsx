import { requireAccess } from "@/server/auth/current-user";
import { listDelegateCandidates, listMyDelegations } from "@/server/manager/delegation";
import { todayISO } from "@/lib/fy";
import { DelegationClient } from "./delegation-client";

export const metadata = { title: "Delegation · SmartSense" };

// KAN-225 — Manager Delegation settings. Server Component, gated to approvers via
// requireAccess (/settings/delegation → team_lead/project_manager/hr_head/admin).
// Loads the delegations this manager has created + the pick-list of candidates,
// and hands them to a client that persists via create/cancelDelegationAction.
export default async function DelegationPage() {
  const user = await requireAccess("/settings/delegation");
  const [delegations, candidates] = await Promise.all([
    listMyDelegations(user.id),
    listDelegateCandidates(user.id),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Approval delegation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hand your leave &amp; expense approvals to a colleague while you&apos;re away. They act with your
          authority for the dates you choose; you can cancel anytime.
        </p>
      </div>
      <DelegationClient delegations={delegations} candidates={candidates} today={todayISO()} />
    </div>
  );
}
