"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { VersionBadge } from "@/components/ui/version-badge";
import { useToast } from "@/components/providers";
import { deleteClaimAction } from "@/server/actions/delete-claim";
import { deleteDraftAction } from "@/server/actions/draft-expense";
import { cn } from "@/lib/cn";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import type { MyClaim } from "@/server/employee/claims";
import { STATUS_CLS } from "@/app/(app)/submit/claim-status";
import { fmtDate, fmtMoney, fmtTimestamp } from "@/app/(app)/submit/claim-format";

export function DetailModal({ claim, onClose }: { claim: MyClaim; onClose: () => void }) {
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  useEscapeKey(onClose);

  function deleteClaim() {
    startTransition(async () => {
      const action = claim.isDraft ? deleteDraftAction({ draftId: claim.id }) : deleteClaimAction({ claimId: claim.id });
      const res = await action;
      if (!res.ok) {
        flash(res.error ?? "Could not delete the claim", "warn");
        return;
      }
      flash(claim.isDraft ? "Draft deleted" : "Claim deleted", "ok");
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
            <div className="flex items-center gap-1.5">
              <StatusPill label={claim.statusLabel} className={STATUS_CLS[claim.status] ?? "bg-muted text-muted-foreground"} />
              {claim.version > 1 && <VersionBadge version={claim.version} />}
            </div>
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

        {claim.isDraft && !confirming && (
          <div className="flex gap-2.5 border-t border-border px-5 py-4">
            <Link
              href={`/submit?draft=${claim.id}`}
              onClick={onClose}
              className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[9px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil className="size-4" />
              Edit draft
            </Link>
            <Button variant="destructive-outline" onClick={() => setConfirming(true)} className="hover:bg-destructive/10">
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        )}

        {claim.status === "rejected" && !confirming && (
          <div className="flex gap-2.5 border-t border-border px-5 py-4">
            <Link
              href={`/submit?resubmit=${claim.id}`}
              onClick={onClose}
              className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[9px] bg-primary px-4 text-[13.5px] font-medium text-primary-foreground shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="size-4" />
              Edit & resubmit
            </Link>
          </div>
        )}

        {(claim.canDelete || claim.isDraft) && confirming && (
          <div className="border-t border-border px-5 py-4">
            <div className="flex flex-col gap-2.5">
              <p className="text-[12.5px] text-muted-foreground">
                {claim.isDraft
                  ? "Delete this draft? This can't be undone."
                  : "Delete this claim? It's still under review and this can't be undone."}
              </p>
              <div className="flex gap-2.5">
                <Button
                  onClick={deleteClaim}
                  disabled={pending}
                  className="flex-1 bg-destructive text-white hover:bg-destructive/90"
                >
                  {pending ? "Deleting…" : claim.isDraft ? "Yes, delete draft" : "Yes, delete claim"}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                  Keep it
                </Button>
              </div>
            </div>
          </div>
        )}

        {claim.canDelete && !claim.isDraft && !confirming && (
          <div className="border-t border-border px-5 py-4">
            <Button
              variant="destructive-outline"
              onClick={() => setConfirming(true)}
              className="w-full hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Delete claim
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
