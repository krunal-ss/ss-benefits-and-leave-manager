"use client";

// KAN-187 — Leave Policy Viewer: a card grid of policies, a detail screen
// with eligibility/carry-forward/FAQ accordion, and a "Download PDF" button
// that fetches a fresh short-lived signed URL on click (never baked into the
// page — the URL expires in 60s, see storage.ts).
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Download, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
import { getLeavePolicyDocumentUrlAction } from "@/server/actions/leave-policy";
import type { LeavePolicy } from "@/server/policy";

export function LeavePolicyClient({
  policies,
  initialSelectedId,
}: {
  policies: LeavePolicy[];
  initialSelectedId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId && policies.some((p) => p.id === initialSelectedId) ? initialSelectedId : null,
  );
  const [faqOpen, setFaqOpen] = useState<number>(-1);
  const { flash } = useToast();
  const [downloading, setDownloading] = useState(false);

  const selected = useMemo(() => policies.find((p) => p.id === selectedId) ?? null, [policies, selectedId]);

  async function downloadPdf() {
    setDownloading(true);
    const url = await getLeavePolicyDocumentUrlAction();
    setDownloading(false);
    if (!url) {
      flash("No policy document has been uploaded yet.", "warn");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-[18px]">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Leave policies</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Eligibility, accrual, carry-forward rules and FAQs for every leave type.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {policies.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setFaqOpen(-1);
              }}
              className="flex flex-col gap-3 rounded-[14px] border bg-card px-[22px] py-5 text-left shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-muted text-[13px] font-bold">
                  {p.code}
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold tracking-[-0.01em]">{p.name}</div>
                  <div className="text-[12.5px] text-muted-foreground">{p.summary}</div>
                </div>
                <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 items-center gap-1.5 rounded-[7px] bg-muted px-2.5 text-[12px] font-medium">
                  {p.annual}
                </span>
                <span
                  className={`inline-flex h-6 items-center rounded-[7px] px-2.5 text-[12px] font-medium ${
                    p.carryAllowed ? "bg-emerald-500/[0.13] text-emerald-600" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {p.carryHeadline}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[940px] flex-col gap-5">
      <button
        onClick={() => setSelectedId(null)}
        className="inline-flex h-[30px] w-fit items-center gap-1.5 rounded-lg border bg-background px-[11px] text-[12.5px] font-medium shadow-xs hover:bg-accent"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2} />
        All policies
      </button>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[13px] bg-muted text-[16px] font-bold">
          {selected.code}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{selected.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{selected.summary}</p>
        </div>
        <Button onClick={downloadPdf} disabled={downloading}>
          <Download className="size-[15px]" strokeWidth={2} />
          {downloading ? "Preparing…" : "Download PDF"}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Entitlement" value={selected.annual} />
        <Stat label="Approver" value={selected.approver} />
        <Stat label="Notice" value={selected.notice} />
        <Stat label="Encashment" value={selected.encash} />
      </div>

      <div className="grid grid-cols-2 items-start gap-4">
        <Card className="flex flex-col gap-3 px-[22px] py-5">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Eligibility</div>
          {selected.eligibility.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No eligibility details published yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {selected.eligibility.map((e, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13.5px] leading-[1.45]">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" strokeWidth={2.2} />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}
          {selected.accrual && (
            <div className="border-t pt-1.5 text-[12.5px] text-muted-foreground">Accrual · {selected.accrual}</div>
          )}
        </Card>

        <Card
          className={`flex flex-col gap-3 px-[22px] py-5 ${
            selected.carryAllowed ? "border-emerald-500/30 bg-emerald-500/[0.06]" : ""
          }`}
        >
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Carry-forward</div>
          <div className={`text-[14px] font-semibold ${selected.carryAllowed ? "text-emerald-600" : ""}`}>
            {selected.carryHeadline}
          </div>
          <p className="text-[13px] leading-[1.55] text-muted-foreground">
            {selected.carryText || "No carry-forward details published yet."}
          </p>
        </Card>
      </div>

      {selected.process.length > 0 && (
        <Card className="flex flex-col gap-3.5 px-[22px] py-5">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">How to apply</div>
          <div className="flex flex-col gap-2.5">
            {selected.process.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-semibold">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[13.5px] leading-[1.5]">{step}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {selected.faqs.length > 0 && (
        <Card className="overflow-hidden py-0">
          <div className="border-b px-[22px] py-4 text-[15px] font-semibold tracking-[-0.01em]">Frequently asked</div>
          {selected.faqs.map((f, i) => (
            <div key={i} className="border-b last:border-b-0">
              <button
                onClick={() => setFaqOpen((cur) => (cur === i ? -1 : i))}
                className="flex w-full items-center gap-3 px-[22px] py-[15px] text-left text-[13.5px] font-medium"
              >
                <span className="flex-1">{f.q}</span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${faqOpen === i ? "rotate-180" : ""}`}
                  strokeWidth={2}
                />
              </button>
              {faqOpen === i && (
                <div className="px-[22px] pb-4 text-[13px] leading-[1.6] text-muted-foreground">{f.a}</div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold">{value || "—"}</div>
    </Card>
  );
}
