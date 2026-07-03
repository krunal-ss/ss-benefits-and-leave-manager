"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/providers";
import { deleteClaimAction } from "@/server/actions/delete-claim";
import { cn } from "@/lib/cn";
import type { MyClaim } from "@/server/employee/claims";
import { STATUS_CLS } from "@/app/(app)/submit/claim-status";
import { fmtDate, fmtMoney, fmtTimestamp } from "@/app/(app)/submit/claim-format";

export function DetailModal({ claim, onClose }: { claim: MyClaim; onClose: () => void }) {
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
            <StatusPill label={claim.statusLabel} className={STATUS_CLS[claim.status] ?? "bg-muted text-muted-foreground"} />
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
