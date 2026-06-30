import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getCategoryBalances } from "@/server/employee/balances";
import { currentFy } from "@/lib/fy";
import { SubmitForm } from "./submit-form";

export const metadata = { title: "Submit expense · SmartSense" };

export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const balances = await getCategoryBalances(user.id, currentFy().label);
  const sports = balances.find((b) => b.key === "sports");
  const learning = balances.find((b) => b.key === "learning");

  return (
    <SubmitForm
      sportsAvail={(sports?.availablePaise ?? 0) / 100}
      learningAvail={(learning?.availablePaise ?? 0) / 100}
      sportsCap={(sports?.capPaise ?? 1500000) / 100}
      learningCap={(learning?.capPaise ?? 4500000) / 100}
    />
  );
}
