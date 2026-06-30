import { requireAccess } from "@/server/auth/current-user";
import { ExpensesClient } from "./expenses-client";

export const metadata = { title: "Expense queue · SmartSense" };

export default async function ExpensesPage() {
  await requireAccess("/expenses");
  return <ExpensesClient />;
}
