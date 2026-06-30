import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getCategoryBalances } from "@/server/employee/balances";
import { listMyClaims } from "@/server/employee/claims";
import { currentFy } from "@/lib/fy";
import { SubmitForm } from "./submit-form";
import { MyClaims } from "./my-claims";

export const metadata = { title: "Submit expense · SmartSense" };

export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const balances = await getCategoryBalances(user.id, currentFy().label);
  const sports = balances.find((b) => b.key === "sports");
  const learning = balances.find((b) => b.key === "learning");

  const claims = await listMyClaims(user.id);

  return (
    <div className="flex flex-col gap-9">
      <SubmitForm
        sportsAvail={(sports?.availablePaise ?? 0) / 100}
        learningAvail={(learning?.availablePaise ?? 0) / 100}
        sportsCap={(sports?.capPaise ?? 1500000) / 100}
        learningCap={(learning?.capPaise ?? 4500000) / 100}
      />
      <MyClaims claims={claims} />
    </div>
  );
}
