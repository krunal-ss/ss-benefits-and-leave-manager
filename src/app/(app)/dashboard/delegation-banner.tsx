import Link from "next/link";
import { ArrowRight, UserCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DelegationCoverage } from "@/server/manager/delegation";

// KAN-225 — Dashboard banner shown when approvals are currently delegated TO the
// viewer. Gives a non-manager delegate a way IN to the delegated queue (their
// role hides it from the sidebar; requireAccess still lets them through). Server
// Component; the dashboard renders it only when there's active coverage.
export function DelegationBanner({ coverage }: { coverage: DelegationCoverage }) {
  const names = Array.from(
    new Set([...coverage.leave, ...coverage.expense].map((d) => d.managerName)),
  );
  const hasLeave = coverage.leave.length > 0;
  const hasExpense = coverage.expense.length > 0;

  return (
    <Card className="flex items-start gap-3.5 border-blue-600/30 bg-blue-600/[0.06] p-4">
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-blue-600/15 text-blue-600 dark:text-blue-400">
        <UserCog className="size-[19px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold">
          You&apos;re covering approvals for {names.join(", ")}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          You can act on their pending approvals while their delegation is active.
        </p>
        <div className="mt-[11px] flex flex-wrap gap-2">
          {hasLeave && (
            <Link
              href="/approvals"
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border bg-card px-3 text-[12.5px] font-medium hover:bg-accent"
            >
              Leave approvals
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </Link>
          )}
          {hasExpense && (
            <Link
              href="/expenses"
              className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border bg-card px-3 text-[12.5px] font-medium hover:bg-accent"
            >
              Expense queue
              <ArrowRight className="size-3.5" strokeWidth={2} />
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
