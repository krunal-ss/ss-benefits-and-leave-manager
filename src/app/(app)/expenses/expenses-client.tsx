"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckBig } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/providers";
import { HARD_FLAGS, type QueuedClaim } from "@/server/hr/queue-types";
import { decideExpenseAction } from "@/server/actions/decide-expense";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ReviewDrawer } from "@/app/(app)/expenses/review-drawer";

type Stats = { pending: number; reservedPaise: number; approvedCount: number; approvedPaise: number; rejectedCount: number };

function flagClasses(flag: string) {
  return HARD_FLAGS.has(flag)
    ? "bg-red-500/[0.13] text-destructive"
    : "bg-amber-500/[0.16] text-amber-700";
}

export function ExpensesClient({ claims, stats: liveStats }: { claims: QueuedClaim[]; stats: Stats }) {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistically drop a decided claim so the row disappears immediately; the
  // server action + router.refresh re-syncs the queue (and the stats) from the DB.
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const hrClaims = claims.filter((c) => !decidedIds.has(c.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const selected = hrClaims.find((c) => c.id === selectedId) ?? null;

  const close = () => {
    setSelectedId(null);
    setReason("");
  };

  const decide = (approve: boolean) => {
    if (!selected || pending) return;
    if (!approve && !reason.trim()) {
      flash("Add a reason the employee will see", "warn");
      return;
    }
    const claimId = selected.id;
    const note = reason.trim();
    close();
    startTransition(async () => {
      const res = await decideExpenseAction({ claimId, approve, reason: note });
      if (res.ok) setDecidedIds((s) => new Set(s).add(claimId));
      flash(res.message, res.ok ? "ok" : "warn");
      router.refresh();
    });
  };

  const stats = [
    { label: "Pending review", value: String(hrClaims.length), sub: "Awaiting your decision", color: "text-foreground" },
    { label: "Approved this FY", value: String(liveStats.approvedCount), sub: `${formatINR(liveStats.approvedPaise / 100)} total`, color: "text-emerald-500" },
    { label: "Rejected this FY", value: String(liveStats.rejectedCount), sub: "With reasons logged", color: "text-foreground" },
    { label: "Reserved balance", value: formatINR(liveStats.reservedPaise / 100), sub: "Across all employees", color: "text-foreground" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Expense approval queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Claims that failed automated verification, with extracted fields and flags.
          </p>
        </div>
        <Link href="/expenses/history" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
          Decided claims →
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-3.5">
        {stats.map((s) => (
          <Card key={s.label} className="flex flex-col gap-1 rounded-xl px-[18px] py-4">
            <div className="text-[12.5px] text-muted-foreground">{s.label}</div>
            <div className={cn("tabular text-2xl font-semibold tracking-[-0.01em]", s.color)}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.sub}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center border-b px-5 py-4">
          <div className="text-[15px] font-semibold">Pending HR review</div>
          <span className="ml-2.5 inline-flex h-5 items-center rounded-md bg-muted px-2 text-[11.5px] font-semibold text-muted-foreground">
            {hrClaims.length} claims
          </span>
        </div>

        {hrClaims.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 p-14 text-muted-foreground">
            <CircleCheckBig className="size-[26px]" strokeWidth={1.8} />
            <div className="text-sm font-medium text-foreground">Queue cleared</div>
            <div className="text-[13px]">All pending claims have been decided.</div>
          </div>
        ) : (
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-[12.5px] text-muted-foreground">
                <th className="border-b px-5 py-[11px] text-left font-medium">Employee</th>
                <th className="border-b px-3 py-[11px] text-left font-medium">Category</th>
                <th className="border-b px-3 py-[11px] text-right font-medium">Claimed</th>
                <th className="border-b px-3 py-[11px] text-right font-medium">OCR amount</th>
                <th className="border-b px-3 py-[11px] text-left font-medium">Flags</th>
                <th className="border-b" />
              </tr>
            </thead>
            <tbody>
              {hrClaims.map((q) => (
                <tr key={q.id} className="border-b transition-colors hover:bg-muted/55">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={q.initials} className="size-[30px] text-[11.5px]" />
                      <div>
                        <div className="font-medium">{q.name}</div>
                        <div className="text-[11.5px] text-muted-foreground">{q.dept}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">{q.category}</td>
                  <td className="tabular px-3 py-3 text-right font-medium">{formatINR(q.claimed)}</td>
                  <td className={cn("tabular px-3 py-3 text-right", q.claimed !== q.extracted ? "text-destructive" : "text-muted-foreground")}>
                    {formatINR(q.extracted)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-[5px]">
                      {q.flags.map((f) => (
                        <span key={f} className={cn("inline-flex h-[21px] items-center rounded-md px-2 text-[11px] font-medium", flagClasses(f))}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedId(q.id); setReason(""); }}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {selected && (
        <ReviewDrawer claim={selected} reason={reason} setReason={setReason} onClose={close} onDecide={decide} pending={pending} />
      )}
    </div>
  );
}
