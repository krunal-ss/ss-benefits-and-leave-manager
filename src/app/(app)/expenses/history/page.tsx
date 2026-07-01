import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAccess } from "@/server/auth/current-user";
import { getDecidedClaims } from "@/server/hr/expenses";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pager } from "@/components/ui/pager";
import { formatINR } from "@/lib/format";
import { pageParam } from "@/lib/page-param";

export const metadata = { title: "Decided claims · SmartSense" };

export default async function DecidedClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAccess("/expenses/history");
  const page = pageParam((await searchParams).page);
  const decided = await getDecidedClaims({ page });
  const claims = decided.items;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Decided claims</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every approved, auto-approved, rejected, and reimbursed expense claim.
          </p>
        </div>
        <Link href="/expenses" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
          ← Back to queue
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center border-b px-5 py-4">
          <div className="text-[15px] font-semibold">Decision history</div>
          <span className="ml-2.5 inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
            {claims.length} {claims.length === 1 ? "claim" : "claims"}
          </span>
        </div>

        {claims.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 p-14 text-muted-foreground">
            <Inbox className="size-[26px]" strokeWidth={1.8} />
            <div className="text-sm font-medium text-foreground">No decided claims yet</div>
            <div className="text-[13px]">Approved and rejected claims will appear here.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="text-[12.5px] text-muted-foreground">
                  <th className="border-b px-5 py-[11px] text-left font-medium">Employee</th>
                  <th className="border-b px-3 py-[11px] text-left font-medium">Category</th>
                  <th className="border-b px-3 py-[11px] text-right font-medium">Amount</th>
                  <th className="border-b px-3 py-[11px] text-left font-medium">Expense date</th>
                  <th className="border-b px-3 py-[11px] text-left font-medium">Status</th>
                  <th className="border-b px-3 py-[11px] text-left font-medium">Decided by</th>
                  <th className="border-b px-5 py-[11px] text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-b transition-colors hover:bg-muted/55">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={c.initials} className="size-[30px] text-[11.5px]" />
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {c.dept} · {c.ref}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">{c.category}</td>
                    <td className="tabular px-3 py-3 text-right font-medium">{formatINR(c.amount)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{c.date}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={c.statusLabel} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{c.decidedBy}</td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-muted-foreground" title={c.reason}>
                      {c.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pager basePath="/expenses/history" page={decided.page} hasMore={decided.hasMore} />
    </div>
  );
}
