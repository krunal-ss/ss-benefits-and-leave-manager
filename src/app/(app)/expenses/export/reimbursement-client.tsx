"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Inbox, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/providers";
import { markReimbursedAction } from "@/server/actions/mark-reimbursed";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "@/app/(app)/expenses/export/confirm-dialog";

type Row = {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  claimCount: number;
  totalPaise: number;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function ReimbursementClient({
  fy,
  rows,
  totalPaise,
  totalClaims,
}: {
  fy: string;
  rows: Row[];
  totalPaise: number;
  totalClaims: number;
}) {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const empty = rows.length === 0;

  const confirmPayout = () => {
    if (pending || empty) return;
    setConfirming(false);
    startTransition(async () => {
      const res = await markReimbursedAction({ fy });
      flash(res.message, res.ok ? "ok" : "warn");
      router.refresh();
    });
  };

  const summary = [
    { label: "Employees", value: String(rows.length), sub: "With payable claims" },
    { label: "Claims to pay", value: String(totalClaims), sub: "Approved + auto-approved" },
    { label: "Payout total", value: formatINR(totalPaise / 100), sub: `Financial year ${fy}`, accent: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Reimbursement export</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-employee payout totals for FY {fy}. Export the file, then confirm payout to mark claims reimbursed.
          </p>
        </div>
        <Link href="/expenses" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
          ← Back to queue
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        {summary.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1 rounded-xl px-[18px] py-4">
            <div className="text-[12.5px] text-muted-foreground">{s.label}</div>
            <div className={cn("tabular text-2xl font-semibold tracking-[-0.01em]", s.accent && "text-emerald-500")}>
              {s.value}
            </div>
            <div className="text-xs text-muted-foreground">{s.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="text-[15px] font-semibold">Payout by employee</div>
          <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
            {rows.length} {rows.length === 1 ? "employee" : "employees"}
          </span>
          <a
            href={`/expenses/export/download?fy=${encodeURIComponent(fy)}`}
            className={cn(
              "ml-auto inline-flex h-[30px] cursor-pointer items-center justify-center gap-2 rounded-[7px] border bg-background px-[11px] text-[12.5px] font-medium text-foreground shadow-xs transition-colors hover:bg-accent",
              empty && "pointer-events-none opacity-50",
            )}
            aria-disabled={empty}
            download
          >
            <Download className="size-[14px]" strokeWidth={2} />
            Download CSV
          </a>
        </div>

        {empty ? (
          <div className="flex flex-col items-center gap-2.5 p-14 text-muted-foreground">
            <Inbox className="size-[26px]" strokeWidth={1.8} />
            <div className="text-sm font-medium text-foreground">Nothing awaiting payout</div>
            <div className="text-[13px]">All approved claims for FY {fy} have been reimbursed.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="text-[12.5px] text-muted-foreground">
                  <th className="border-b px-5 py-[11px] text-left font-medium">Employee</th>
                  <th className="border-b px-3 py-[11px] text-left font-medium">Department</th>
                  <th className="border-b px-3 py-[11px] text-right font-medium">Claims</th>
                  <th className="border-b px-5 py-[11px] text-right font-medium">Payout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b transition-colors hover:bg-muted/55">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar initials={initialsOf(r.name)} className="size-[30px] text-[11.5px]" />
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[11.5px] text-muted-foreground">{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{r.department ?? "—"}</td>
                    <td className="tabular px-3 py-3 text-right">{r.claimCount}</td>
                    <td className="tabular px-5 py-3 text-right font-medium">{formatINR(r.totalPaise / 100)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-5 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="tabular px-3 py-3 text-right">{totalClaims}</td>
                  <td className="tabular px-5 py-3 text-right">{formatINR(totalPaise / 100)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {!empty && (
        <Card className="flex items-center gap-4 rounded-xl px-5 py-4">
          <Wallet className="size-5 text-muted-foreground" strokeWidth={1.8} />
          <div className="flex-1">
            <div className="text-sm font-medium">Confirm payout for FY {fy}</div>
            <div className="text-[12.5px] text-muted-foreground">
              Marks all {totalClaims} payable claims as reimbursed and writes an audit record. This does not disburse money.
            </div>
          </div>
          <Button onClick={() => setConfirming(true)} disabled={pending}>
            {pending ? "Saving…" : "Confirm payout"}
          </Button>
        </Card>
      )}

      {confirming && (
        <ConfirmDialog
          fy={fy}
          count={totalClaims}
          totalLabel={formatINR(totalPaise / 100)}
          onCancel={() => setConfirming(false)}
          onConfirm={confirmPayout}
        />
      )}
    </div>
  );
}
