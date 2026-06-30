import { requireAccess } from "@/server/auth/current-user";
import { getHrExpenseQueue, getHrExpenseStats } from "@/server/hr/expenses";
import { ExpensesClient } from "./expenses-client";

export const metadata = { title: "Expense queue · SmartSense" };

export default async function ExpensesPage() {
  await requireAccess("/expenses");
  const [claims, stats] = await Promise.all([getHrExpenseQueue(), getHrExpenseStats()]);
  return <ExpensesClient claims={claims} stats={stats} />;
}
