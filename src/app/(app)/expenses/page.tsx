import { requireAccess } from "@/server/auth/current-user";
import { getHrExpenseQueue, getHrExpenseStats } from "@/server/hr/expenses";
import { pageParam } from "@/lib/page-param";
import { Pager } from "@/components/ui/pager";
import { ExpensesClient } from "./expenses-client";

export const metadata = { title: "Expense queue · SmartSense" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAccess("/expenses");
  const page = pageParam((await searchParams).page);
  const [queue, stats] = await Promise.all([getHrExpenseQueue({ page }), getHrExpenseStats()]);
  return (
    <div className="flex flex-col gap-5">
      <ExpensesClient claims={queue.items} stats={stats} />
      <Pager basePath="/expenses" page={queue.page} hasMore={queue.hasMore} />
    </div>
  );
}
