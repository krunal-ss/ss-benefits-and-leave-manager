"use client";

import { useEffect } from "react";
import Link from "next/link";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VersionBadge } from "@/components/ui/version-badge";
import { AiScoreBadge } from "@/components/ui/ai-score-badge";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { QueuedClaim } from "@/server/hr/queue-types";
import { DetailRow } from "@/app/(app)/expenses/detail-row";

function confidenceColor(confidence: string) {
  if (confidence.includes("Low")) return "text-destructive";
  if (confidence.includes("Medium")) return "text-amber-700";
  return "text-emerald-500";
}

export function ReviewDrawer({
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-[60] bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Review claim for ${claim.name}`}
        className="fixed inset-y-0 right-0 z-[70] flex w-[440px] max-w-[92vw] flex-col border-l bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b px-[22px] py-[18px]">
          <div>
            <div className="text-base font-semibold">{claim.name}</div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              {claim.dept} · claim {claim.ref}
              {claim.version > 1 && <VersionBadge version={claim.version} />}
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
          <div className="flex items-center justify-between gap-3 rounded-[10px] border px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-muted-foreground">AI recommendation</span>
              <AiScoreBadge score={claim.aiScore} verdict={claim.aiVerdict} />
            </div>
            <Link href={`/expenses/${claim.id}/intelligence`} className="text-[12.5px] font-medium text-foreground hover:underline">
              Full analysis →
            </Link>
          </div>

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
