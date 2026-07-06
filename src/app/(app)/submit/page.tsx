import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getCategoryBalances } from "@/server/employee/balances";
import { getDraftClaim, listMyClaims } from "@/server/employee/claims";
import { currentFy } from "@/lib/fy";
import { pageParam } from "@/lib/page-param";
import { Pager } from "@/components/ui/pager";
import { SubmitForm } from "./submit-form";
import { MyClaims } from "./my-claims";

export const metadata = { title: "Submit expense · SmartSense" };

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; draft?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const balances = await getCategoryBalances(user.id, currentFy().label);
  const sports = balances.find((b) => b.key === "sports");
  const learning = balances.find((b) => b.key === "learning");

  const sp = await searchParams;
  const page = pageParam(sp.page);
  const claims = await listMyClaims(user.id, { page });
  // KAN-125 — resuming a draft via /submit?draft=<id>; silently ignored if not
  // found/not owned/no longer a draft (the form just starts blank instead).
  const draft = sp.draft ? await getDraftClaim(user.id, sp.draft) : null;

  return (
    <div className="flex flex-col gap-9">
      <SubmitForm
        key={draft?.id ?? "new"}
        sportsAvail={(sports?.availablePaise ?? 0) / 100}
        learningAvail={(learning?.availablePaise ?? 0) / 100}
        sportsCap={(sports?.capPaise ?? 1500000) / 100}
        learningCap={(learning?.capPaise ?? 4500000) / 100}
        draft={
          draft
            ? {
                id: draft.id,
                category: draft.category,
                amountRupees: draft.amountRupees,
                date: draft.date,
                vendor: draft.vendor,
                hasDocument: draft.hasDocument,
              }
            : null
        }
      />
      <MyClaims claims={claims.items} />
      <Pager basePath="/submit" page={claims.page} hasMore={claims.hasMore} />
    </div>
  );
}
