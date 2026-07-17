"use client";

// KAN-167 (Leave Balance History) — the "Balance History" view on /leave,
// mirroring the wallet ledger's table + CSV-export-as-client-Blob pattern
// (src/app/(app)/submit/wallet-ledger.tsx). Read-only: every row here is
// derived server-side by getLeaveBalanceHistory for the SIGNED-IN user only —
// there is no id/param on this route that could target another employee.
import { useState } from "react";
import { Download, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { LeaveLedgerEntry, LeaveLedgerEntryType } from "@/server/employee/leave-ledger";

const EVENT_META: Record<LeaveLedgerEntryType, { label: string; badgeCls: string; daysCls: string }> = {
  opening: { label: "Opening balance", badgeCls: "bg-muted text-foreground", daysCls: "text-foreground" },
  accrual: { label: "Accrual", badgeCls: "bg-emerald-500/15 text-emerald-500", daysCls: "text-emerald-500" },
  deduction: { label: "Leave taken", badgeCls: "bg-muted text-foreground", daysCls: "text-foreground" },
  restore: { label: "Balance restored", badgeCls: "bg-emerald-500/15 text-emerald-500", daysCls: "text-emerald-500" },
  adjustment: { label: "Balance adjustment", badgeCls: "bg-amber-500/15 text-[#b45309]", daysCls: "text-[#b45309]" },
};

/** Both a bare "YYYY-MM-DD" (opening/adjustment) and a full audit timestamp share this 10-char date prefix. */
function fmtHistoryDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtSignedDays(days: number): string {
  if (days === 0) return "0";
  const sign = days > 0 ? "+ " : "− ";
  return sign + Math.abs(days);
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: LeaveLedgerEntry[], fy: string) {
  const headers = ["Date", "Event", "Leave type", "Days", "Running balance"];
  const lines = [headers.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.dateIso.slice(0, 10)),
        csvField(EVENT_META[r.type].label),
        csvField(`${r.typeLabel} (${r.code})`),
        csvField(r.days),
        csvField(r.runningBalanceDays),
      ].join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leave-balance-history-${fy}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LeaveHistory({ entries, fy }: { entries: LeaveLedgerEntry[]; fy: string }) {
  const [announcement, setAnnouncement] = useState("");

  function handleExport() {
    downloadCsv(entries, fy);
    setAnnouncement("Leave balance history CSV downloaded.");
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-[18px] py-3.5">
        <div className="text-[15px] font-semibold">Balance history · FY {fy}</div>
        <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <button
          onClick={handleExport}
          disabled={entries.length === 0}
          className="ml-auto inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium text-foreground shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <History className="size-6 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
          <div className="text-sm font-medium">No balance history yet</div>
          <div className="text-[13px] text-muted-foreground">
            Accruals, leave taken, and balance changes for this financial year will show up here.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">Leave balance history for FY {fy}</caption>
            <thead>
              <tr className="border-b border-border text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Event
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Leave type
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Days
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Running balance
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtHistoryDate(e.dateIso)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex h-[21px] items-center rounded-md px-2 text-[11px] font-medium", EVENT_META[e.type].badgeCls)}>
                      {EVENT_META[e.type].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{e.typeLabel}</div>
                    <div className="text-[11.5px] text-muted-foreground">{e.code}</div>
                  </td>
                  <td className={cn("px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap", EVENT_META[e.type].daysCls)}>
                    {fmtSignedDays(e.days)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {e.runningBalanceDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
