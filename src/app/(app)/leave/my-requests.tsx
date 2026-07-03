"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { MyRequest } from "@/server/employee/requests";
import { STATUS_CLS } from "@/app/(app)/leave/leave-status";
import { fmtDate, fmtRange } from "@/app/(app)/leave/leave-format";
import { DetailModal } from "@/app/(app)/leave/request-detail-modal";

export function MyRequests({ requests }: { requests: MyRequest[] }) {
  const [active, setActive] = useState<MyRequest | null>(null);

  return (
    <div className="max-w-[980px]">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">My leave / WFH requests</h2>
      <p className="mt-1 mb-3.5 text-[13px] text-muted-foreground">
        Everything you&apos;ve applied for. Click a row for the full detail.
      </p>

      <Card className="overflow-hidden p-0">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <CalendarDays className="size-6 text-muted-foreground" strokeWidth={1.5} />
            <div className="text-sm font-medium">No requests yet</div>
            <div className="text-[13px] text-muted-foreground">
              Your leave and WFH applications will show up here.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Dates</th>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Applied on</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setActive(r)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActive(r);
                      }
                    }}
                    className="cursor-pointer border-b border-border last:border-0 outline-none hover:bg-accent focus-visible:bg-accent"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.typeLabel}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {r.typeCode}
                        {r.halfDay ? " · Half-day" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtRange(r.from, r.to)}</td>
                    <td className="px-4 py-3 tabular-nums">{r.days}</td>
                    <td className="px-4 py-3">
                      <StatusPill label={r.statusLabel} className={STATUS_CLS[r.status] ?? "bg-muted text-muted-foreground"} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {fmtDate(r.createdAt.slice(0, 10))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active && <DetailModal request={active} onClose={() => setActive(null)} />}
    </div>
  );
}
