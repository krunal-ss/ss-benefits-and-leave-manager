import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { getCategoryBalances } from "@/server/employee/balances";
import { getDraftClaim, getRejectedClaim, listMyClaims } from "@/server/employee/claims";
import { getWalletLedger } from "@/server/employee/ledger";
import { getFavoriteVendors } from "@/server/employee/favorite-vendors";
import { currentFy } from "@/lib/fy";
import { pageParam } from "@/lib/page-param";
import { Pager } from "@/components/ui/pager";
import { SubmitForm } from "./submit-form";
import { MyClaims } from "./my-claims";

export const metadata = { title: "Submit expense · SmartSense" };

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; draft?: string; resubmit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const fy = currentFy().label;
  const sp = await searchParams;
  const page = pageParam(sp.page);

  // All of these are independent per-user/per-FY reads — fetch concurrently
  // rather than as a chain of sequential round-trips.
  const [balances, claims, ledger, draft, resubmit, favoriteVendors] = await Promise.all([
    getCategoryBalances(user.id, fy),
    listMyClaims(user.id, { page }),
    getWalletLedger(user.id, fy),
    // KAN-125 — resuming a draft via /submit?draft=<id>; silently ignored if not
    // found/not owned/no longer a draft (the form just starts blank instead).
    sp.draft ? getDraftClaim(user.id, sp.draft) : Promise.resolve(null),
    // KAN-126 — resubmitting a rejected claim via /submit?resubmit=<id>; silently
    // ignored if not found/not owned/no longer rejected (form just starts blank).
    sp.resubmit ? getRejectedClaim(user.id, sp.resubmit) : Promise.resolve(null),
    getFavoriteVendors(user.id),
  ]);
  const sports = balances.find((b) => b.key === "sports");
  const learning = balances.find((b) => b.key === "learning");

  return (
    <div className="flex flex-col gap-9">
      <SubmitForm
        key={draft?.id ?? resubmit?.id ?? "new"}
        sportsAvail={(sports?.availablePaise ?? 0) / 100}
        learningAvail={(learning?.availablePaise ?? 0) / 100}
        sportsCap={(sports?.capPaise ?? 1500000) / 100}
        learningCap={(learning?.capPaise ?? 4500000) / 100}
        favoriteVendors={favoriteVendors}
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
        resubmit={
          resubmit
            ? {
                id: resubmit.id,
                category: resubmit.category,
                amountRupees: resubmit.amountRupees,
                date: resubmit.date,
                vendor: resubmit.vendor,
                hasDocument: resubmit.hasDocument,
                nextVersion: resubmit.nextVersion,
              }
            : null
        }
      />
      <MyClaims claims={claims.items} ledger={ledger} fy={fy} />
      <Pager basePath="/submit" page={claims.page} hasMore={claims.hasMore} />
    </div>
  );
}
