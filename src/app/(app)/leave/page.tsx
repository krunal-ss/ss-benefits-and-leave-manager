import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { leaveBalances, leaveRequests, leaveTypes } from "@/db/schema";
import { getCurrentUser } from "@/server/auth/current-user";
import { listApproverOptions } from "@/server/manager/directory";
import { listMyRequests, listActiveRequestRanges } from "@/server/employee/requests";
import { getLeaveBalanceHistory } from "@/server/employee/leave-ledger";
import { currentFy, todayISO } from "@/lib/fy";
import { pageParam } from "@/lib/page-param";
import { Pager } from "@/components/ui/pager";
import type { LeaveTypeKey } from "@/server/leave";
import { LeaveForm } from "./leave-form";
import { MyRequests } from "./my-requests";

export const metadata = { title: "Apply leave / WFH · SmartSense" };

const WFH_MONTHLY_QUOTA = 8;

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const fy = currentFy().label;

  const rows = await db
    .select({ days: leaveBalances.balanceDays, code: leaveTypes.code })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(and(eq(leaveBalances.userId, user.id), eq(leaveBalances.fy, fy)));

  const balances: Record<LeaveTypeKey, number> = { CL: 0, SL: 0, EL: 0, LOP: 0, WFH: 0 };
  for (const r of rows) {
    if (r.code in balances) balances[r.code as LeaveTypeKey] = Number(r.days);
  }

  const month = todayISO().slice(0, 7);
  const wfh = await db
    .select({ from: leaveRequests.fromDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, user.id), eq(leaveRequests.kind, "wfh")));
  const wfhUsed = wfh.filter((w) => w.status === "approved" && w.from.startsWith(month)).length;
  balances.WFH = Math.max(0, WFH_MONTHLY_QUOTA - wfhUsed);

  const { teamLeads, projectManagers } = await listApproverOptions();

  const page = pageParam((await searchParams).page);
  // Overlap check needs ALL active ranges; the list below is paginated for display.
  const [myRequests, existingRanges, history] = await Promise.all([
    listMyRequests(user.id, { page }),
    listActiveRequestRanges(user.id),
    getLeaveBalanceHistory(user.id, fy),
  ]);

  return (
    <div className="flex flex-col gap-9">
      <LeaveForm
        balances={balances}
        teamLeads={teamLeads}
        projectManagers={projectManagers}
        defaultTeamLeadId={user.teamLeadId}
        defaultProjectManagerId={user.projectManagerId}
        existingRanges={existingRanges}
      />
      <MyRequests requests={myRequests.items} history={history} fy={fy} />
      <Pager basePath="/leave" page={myRequests.page} hasMore={myRequests.hasMore} />
    </div>
  );
}
