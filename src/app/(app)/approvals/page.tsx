import { CircleCheckBig } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireAccess } from "@/server/auth/current-user";
import { getApprovalQueue, getOutToday, getPendingCancellations, getTodayLabel } from "@/server/manager/approvals";
import { pageParam } from "@/lib/page-param";
import { Pager } from "@/components/ui/pager";
import { ApprovalCard } from "./approval-card";
import { CancellationCard } from "./cancellation-card";
import { OutTodayPanel } from "./out-today-panel";

export const metadata = { title: "Approvals · SmartSense" };

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireAccess("/approvals");

  const page = pageParam((await searchParams).page);
  const [queue, cancellations, outToday] = await Promise.all([
    getApprovalQueue(user, { page }),
    getPendingCancellations(user), // KAN-127
    getOutToday(user),
  ]);
  const approvals = queue.items;

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
          {cancellations.map((c) => <CancellationCard key={c.id} request={c} />)}
          {approvals.length === 0 && cancellations.length === 0 ? (
            <Card className="flex flex-col items-center gap-2.5 p-14 text-muted-foreground">
              <CircleCheckBig className="size-[26px]" strokeWidth={1.8} />
              <div className="text-sm font-medium text-foreground">All caught up</div>
              <div className="text-[13px]">No pending approvals right now.</div>
            </Card>
          ) : (
            <>
              {approvals.map((a) => <ApprovalCard key={a.id} request={a} />)}
              {approvals.length > 0 && <Pager basePath="/approvals" page={queue.page} hasMore={queue.hasMore} className="mt-1" />}
            </>
          )}
        </div>

        <OutTodayPanel items={outToday} todayLabel={getTodayLabel()} />
      </div>
    </div>
  );
}
