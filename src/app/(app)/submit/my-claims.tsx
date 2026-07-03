"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { MyClaim } from "@/server/employee/claims";
import { STATUS_CLS } from "@/app/(app)/submit/claim-status";
import { fmtDate, fmtMoney } from "@/app/(app)/submit/claim-format";
import { DetailModal } from "@/app/(app)/submit/claim-detail-modal";

export function MyClaims({ claims }: { claims: MyClaim[] }) {
  const [active, setActive] = useState<MyClaim | null>(null);

  return (
    <div className="max-w-[760px]">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">My expense claims</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted-foreground">
        Everything you&apos;ve submitted. Click a row for the full detail; claims under review can be deleted.
      </p>

      <Card className="overflow-hidden p-0">
        {claims.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Receipt className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <div className="text-sm font-medium">No claims yet</div>
            <div className="text-[13px] text-muted-foreground">
              Your submitted expense claims will show up here.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Vendor</th>
                  <th className="px-4 py-2.5 font-medium">Amount</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setActive(c)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActive(c);
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <td className="px-4 py-3 font-medium">{c.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.vendor ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoney(c.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={c.statusLabel} className={STATUS_CLS[c.status] ?? "bg-muted text-muted-foreground"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active && <DetailModal claim={active} onClose={() => setActive(null)} />}
    </div>
  );
}
