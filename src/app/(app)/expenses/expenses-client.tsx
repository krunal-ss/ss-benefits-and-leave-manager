"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheckBig, FileText, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/providers";
import { HARD_FLAGS, type QueuedClaim } from "@/server/hr/queue-types";
import { decideExpenseAction } from "@/server/actions/decide-expense";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";

type Stats = { pending: number; reservedPaise: number; approvedCount: number; approvedPaise: number; rejectedCount: number };

function flagClasses(flag: string) {
  return HARD_FLAGS.has(flag)
    ? "bg-red-500/[0.13] text-destructive"
    : "bg-amber-500/[0.16] text-amber-700";
}

function confidenceColor(confidence: string) {
  if (confidence.includes("Low")) return "text-destructive";
  if (confidence.includes("Medium")) return "text-amber-700";
  return "text-emerald-500";
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

function ReviewDrawer({
  claim,
  reason,
  setReason,
  onClose,
  onDecide,
  pending,
}: {
  claim: QueuedClaim;
  reason: string;
  setReason: (v: string) => void;
  onClose: () => void;
  onDecide: (approve: boolean) => void;
  pending: boolean;
}) {
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/50" />
      <div className="fixed inset-y-0 right-0 z-[70] flex w-[440px] max-w-[92vw] flex-col border-l bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-[22px] py-[18px]">
          <div>
            <div className="text-base font-semibold">{claim.name}</div>
            <div className="text-[12.5px] text-muted-foreground">
              {claim.dept} · claim {claim.ref}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] bg-muted text-muted-foreground hover:bg-accent"
          >
            <X className="size-[15px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] py-5">
          <div className="flex h-[150px] flex-col items-center justify-center gap-[7px] rounded-[11px] border bg-muted text-muted-foreground">
            <FileText className="size-6" strokeWidth={1.8} />
            <span className="text-[12.5px]">receipt-{claim.ref}.pdf</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border px-3.5 py-3">
              <div className="mb-[3px] text-[11.5px] text-muted-foreground">Claimed amount</div>
              <div className="tabular text-[17px] font-semibold">{formatINR(claim.claimed)}</div>
            </div>
            <div className="rounded-[10px] border px-3.5 py-3">
              <div className="mb-[3px] text-[11.5px] text-muted-foreground">OCR extracted</div>
              <div className={cn("tabular text-[17px] font-semibold", claim.claimed !== claim.extracted ? "text-destructive" : "")}>
                {formatINR(claim.extracted)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <DetailRow label="Category" value={claim.category} />
            <DetailRow label="Vendor (OCR)" value={claim.vendor} />
            <DetailRow label="Date" value={claim.date} />
            <DetailRow label="OCR confidence" value={claim.confidence} valueClass={confidenceColor(claim.confidence)} />
          </div>

          <div>
            <div className="mb-[9px] text-[12.5px] font-semibold">Rule outcomes</div>
            <div className="flex flex-col gap-2">
              {claim.checks.map((c) => (
                <div key={c.label} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                      c.ok ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  >
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span className="text-[12.5px]">{c.label}</span>
                  <span className="ml-auto text-[11.5px] text-muted-foreground">{c.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[12.5px]">Decision note (required to reject)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add a reason the employee will see…"
              className="min-h-16 rounded-[9px] text-[13px]"
            />
          </div>
        </div>

        <div className="flex gap-2.5 border-t px-[22px] py-4">
          <Button variant="destructive-outline" onClick={() => onDecide(false)} disabled={pending} className="flex-1">
            Reject
          </Button>
          <Button onClick={() => onDecide(true)} disabled={pending} className="flex-1">
            {pending ? "Saving…" : `Approve ${formatINR(claim.claimed)}`}
          </Button>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", valueClass)}>{value}</span>
    </div>
  );
}
