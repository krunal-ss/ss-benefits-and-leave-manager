"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Receipt, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
import { deleteClaimAction } from "@/server/actions/delete-claim";
import { cn } from "@/lib/cn";
import type { MyClaim } from "@/server/employee/claims";

const STATUS_CLS: Record<string, string> = {
  auto_approved: "bg-emerald-500/15 text-emerald-500",
  approved: "bg-emerald-500/15 text-emerald-500",
  reimbursed: "bg-muted text-muted-foreground",
  pending_hr: "bg-amber-500/15 text-amber-700",
  submitted: "bg-amber-500/15 text-amber-700",
  draft: "bg-amber-500/15 text-amber-700",
  rejected: "bg-red-500/15 text-destructive",
};

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-2 text-[11.5px] font-medium",
        STATUS_CLS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function fmtMoney(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
                      <StatusPill status={c.status} label={c.statusLabel} />
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

function DetailModal({ claim, onClose }: { claim: MyClaim; onClose: () => void }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function deleteClaim() {
    startTransition(async () => {
      const res = await deleteClaimAction({ claimId: claim.id });
      if (!res.ok) {
        flash(res.error ?? "Could not delete the claim", "warn");
        return;
      }
      flash("Claim deleted", "ok");
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Claim detail"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]">
              {fmtMoney(claim.amount)} · {claim.category}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {claim.vendor ?? "No vendor"} · {fmtDate(claim.date)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4 text-[13px]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Status</span>
            <StatusPill status={claim.status} label={claim.statusLabel} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Submitted on</span>
            <span className="font-medium">{fmtTimestamp(claim.createdAt)}</span>
          </div>

          {claim.checks.length > 0 && (
            <div>
              <div className="mb-1.5 text-muted-foreground">Verification checks</div>
              <div className="flex flex-col gap-1.5">
                {claim.checks.map((chk, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-white",
                        chk.ok ? "bg-emerald-500" : "bg-destructive",
                      )}
                    >
                      {chk.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                    </span>
                    <div>
                      <div className="font-medium">{chk.label}</div>
                      <div className="text-[12px] text-muted-foreground">{chk.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {claim.decisionReason && (
            <div>
              <div className="text-muted-foreground">Decision note</div>
              <p className="mt-1 leading-relaxed whitespace-pre-wrap">{claim.decisionReason}</p>
            </div>
          )}
        </div>

        {claim.canDelete && (
          <div className="border-t border-border px-5 py-4">
            {confirming ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-[12.5px] text-muted-foreground">
                  Delete this claim? It&apos;s still under review and this can&apos;t be undone.
                </p>
                <div className="flex gap-2.5">
                  <Button
                    onClick={deleteClaim}
                    disabled={pending}
                    className="flex-1 bg-destructive text-white hover:bg-destructive/90"
                  >
                    {pending ? "Deleting…" : "Yes, delete claim"}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="destructive-outline"
                onClick={() => setConfirming(true)}
                className="w-full hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                Delete claim
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
