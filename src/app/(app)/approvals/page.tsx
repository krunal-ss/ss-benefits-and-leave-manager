import { CircleCheckBig } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getApprovalQueue, getOutToday, getTodayLabel } from "@/server/manager/approvals";
import { ApprovalCard } from "./approval-card";
import { OutTodayPanel } from "./out-today-panel";

export const metadata = { title: "Approvals · SmartSense" };

export default async function ApprovalsPage() {
  const user = await requireAccess("/approvals");

  const [approvals, outToday] = await Promise.all([getApprovalQueue(user), getOutToday(user)]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Leave &amp; WFH approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Requests from your direct reports awaiting your decision.
        </p>
      </div>

      <div className="grid grid-cols-[1.7fr_1fr] items-start gap-[18px]">
        <div className="flex flex-col gap-3.5">
          {approvals.length === 0 ? (
            <Card className="flex flex-col items-center gap-2.5 p-14 text-muted-foreground">
              <CircleCheckBig className="size-[26px]" strokeWidth={1.8} />
              <div className="text-sm font-medium text-foreground">All caught up</div>
              <div className="text-[13px]">No pending approvals right now.</div>
            </Card>
          ) : (
            approvals.map((a) => <ApprovalCard key={a.id} request={a} />)
          )}
        </div>

        <OutTodayPanel items={outToday} todayLabel={getTodayLabel()} />
      </div>
    </div>
  );
}
