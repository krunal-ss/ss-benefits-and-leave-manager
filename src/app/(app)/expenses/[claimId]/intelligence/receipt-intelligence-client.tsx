"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, FileText, History, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/providers";
import { decideExpenseAction } from "@/server/actions/decide-expense";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AiVerdict } from "@/server/verification";
import type { ReceiptIntelligence } from "@/server/hr/expenses";

const VERDICT_META: Record<AiVerdict, { label: string; color: string; bg: string }> = {
  approve: { label: "Recommend approve", color: "var(--emerald-500)", bg: "bg-emerald-500/10" },
  review: { label: "Needs human review", color: "#b45309", bg: "bg-amber-500/[0.11]" },
  reject: { label: "Recommend reject", color: "var(--destructive)", bg: "bg-red-500/[0.1]" },
};

function confidenceColor(pct: number): string {
  return pct >= 85 ? "var(--emerald-500)" : pct >= 65 ? "var(--amber-500)" : "var(--destructive)";
}

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const arc = Math.PI * 50;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * arc;
  return (
    <div className="relative h-20 w-[130px] shrink-0">
      <svg width="130" height="80" viewBox="0 0 120 74" aria-hidden="true">
        <path d="M 10 64 A 50 50 0 0 1 110 64" fill="none" stroke="var(--muted)" strokeWidth="11" strokeLinecap="round" />
        <path
          d="M 10 64 A 50 50 0 0 1 110 64"
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} ${arc.toFixed(1)}`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0.5 text-center">
        <div className="tabular text-[30px] font-bold leading-none" style={{ color }}>
          {score}
        </div>
        <div className="mt-0.5 text-[10.5px] tracking-[0.03em] text-muted-foreground">/ 100 CONFIDENCE</div>
      </div>
    </div>
  );
}

const AUDIT_DOT: Record<"neutral" | "warn" | "bad", string> = {
  neutral: "bg-muted-foreground",
  warn: "bg-amber-500",
  bad: "bg-destructive",
};

const FRAUD_SEVERITY: Record<"ok" | "warn" | "high", { color: string; mark: string; bg: string }> = {
  ok: { color: "var(--emerald-500)", mark: "✓", bg: "" },
  warn: { color: "var(--amber-500)", mark: "!", bg: "bg-amber-500/[0.08]" },
  high: { color: "var(--destructive)", mark: "!", bg: "bg-red-500/[0.09]" },
};

export function ReceiptIntelligenceClient({ intel }: { intel: ReceiptIntelligence }) {
  const { flash } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState(false);

  const verdictMeta = VERDICT_META[intel.verdict];

  const decide = (approve: boolean) => {
    if (pending) return;
    if (!approve && !reason.trim()) {
      flash("Add a reason the employee will see", "warn");
      return;
    }
    startTransition(async () => {
      const res = await decideExpenseAction({ claimId: intel.id, approve, reason: reason.trim() });
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) {
        setDecided(true);
        router.refresh();
      }
    });
  };

  const canDecide = intel.canDecide && !decided;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3.5">
        <Link
          href="/expenses"
          aria-label="Back to expense queue"
          className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border bg-background text-foreground shadow-xs hover:bg-accent"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
        </Link>
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Receipt intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {intel.name} · {intel.dept} · claim {intel.ref} · {intel.category}
          </p>
        </div>
        <span
          className={cn("ml-auto inline-flex h-[30px] items-center gap-[7px] rounded-lg px-[13px] text-[13px] font-semibold", verdictMeta.bg)}
          style={{ color: verdictMeta.color }}
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: verdictMeta.color }} />
          {verdictMeta.label}
        </span>
      </div>

      <div className="grid grid-cols-[0.95fr_1.15fr] items-start gap-5">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-[9px] border-b px-[18px] py-3.5">
            <FileText className="size-4 text-muted-foreground" strokeWidth={2} />
            <span className="text-sm font-semibold">Uploaded receipt</span>
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              {intel.ref}.{intel.fileExt ?? "pdf"}
            </span>
          </div>
          <div className="flex min-h-[260px] items-center justify-center bg-muted/45 p-4">
            {!intel.receiptUrl ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="size-6" strokeWidth={1.8} />
                <span className="text-[12.5px]">Receipt preview unavailable</span>
              </div>
            ) : intel.fileExt === "pdf" ? (
              <iframe title="Receipt preview" src={intel.receiptUrl} className="h-[420px] w-full rounded border bg-background" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL; next/image can't proxy private storage URLs
              <img src={intel.receiptUrl} alt="Uploaded receipt" className="max-h-[420px] w-full rounded border object-contain" />
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="flex items-center gap-[22px]">
              <ScoreGauge score={intel.aiScore} color={verdictMeta.color} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold" style={{ color: verdictMeta.color }}>
                  {verdictMeta.label}
                </div>
                <div className="mt-[5px] text-[12.5px] leading-[1.5] text-muted-foreground">{intel.verdictReason}</div>
              </div>
            </div>
            {intel.factors.length > 0 && (
              <div className="mt-4 border-t pt-3.5">
                <div className="mb-2.5 text-xs font-semibold">Why this score</div>
                <div className="flex flex-col gap-[7px]">
                  {intel.factors.map((f) => (
                    <div key={f.label} className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "tabular inline-flex h-[21px] min-w-10 items-center justify-center rounded-md px-1 text-[11.5px] font-semibold",
                          f.positive ? "bg-emerald-500/[0.13] text-emerald-500" : "bg-red-500/[0.12] text-destructive",
                        )}
                      >
                        {f.delta > 0 ? "+" : ""}
                        {f.delta}
                      </span>
                      <span className="text-[12.5px]">{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <span className="text-[15px] font-semibold">Extracted fields</span>
              <span className="text-xs text-muted-foreground">· OCR confidence per field</span>
            </div>
            {intel.ocrFields.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No OCR data for this claim.</p>
            ) : (
              <div className="flex flex-col gap-[13px]">
                {intel.ocrFields.map((o) => (
                  <div key={o.label} className="grid grid-cols-[120px_1fr_96px] items-center gap-3">
                    <span className="text-[12.5px] text-muted-foreground">{o.label}</span>
                    <span className="truncate text-[13px] font-medium">{o.value}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full"
                          style={{ width: `${o.confidencePercent}%`, backgroundColor: confidenceColor(o.confidencePercent) }}
                        />
                      </div>
                      <span
                        className="tabular min-w-[30px] text-right text-[11px]"
                        style={{ color: confidenceColor(o.confidencePercent) }}
                      >
                        {o.confidencePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 items-start gap-5">
        <Card className="p-5">
          <div className="mb-3.5 flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" strokeWidth={2} />
            <span className="text-[15px] font-semibold">Fraud & anomaly signals</span>
          </div>
          <div className="flex flex-col gap-[3px]">
            {intel.fraudSignals.map((f) => {
              const meta = FRAUD_SEVERITY[f.severity];
              return (
                <div key={f.label} className={cn("flex items-start gap-[11px] rounded-lg px-[11px] py-2.5", meta.bg)}>
                  <span
                    className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.mark}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{f.label}</div>
                    <div className="text-xs leading-[1.45] text-muted-foreground">{f.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3.5 flex items-center gap-2">
            <span className="text-[15px] font-semibold">Duplicate detection</span>
          </div>
          {!intel.duplicate ? (
            <div className="flex flex-col items-center gap-2.5 py-6 text-center text-muted-foreground">
              <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/[0.13] text-emerald-500">
                <Check className="size-5" strokeWidth={2.2} />
              </span>
              <div className="text-[13.5px] font-medium text-foreground">No duplicate found</div>
              <div className="text-[12.5px]">This receipt doesn&apos;t match a prior claim from this employee.</div>
            </div>
          ) : (
            <>
              <div className="mb-3.5 flex items-center gap-2.5 rounded-lg bg-red-500/10 px-3.5 py-2.5">
                <span className="tabular text-xl font-bold text-destructive">{intel.duplicate.similarityPercent}%</span>
                <span className="text-[12.5px] leading-[1.4] text-destructive">match to a prior claim from this employee</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border px-3.5 py-3">
                  <div className="mb-1.5 text-[10.5px] tracking-[0.03em] text-muted-foreground">THIS CLAIM</div>
                  <div className="text-[13px] font-semibold">{intel.ref}</div>
                  <div className="mt-[3px] text-[11.5px] text-muted-foreground">
                    {intel.date} · {formatINR(intel.claimed)}
                  </div>
                </div>
                <div className="rounded-lg border border-destructive/40 bg-red-500/[0.06] px-3.5 py-3">
                  <div className="mb-1.5 text-[10.5px] tracking-[0.03em] text-destructive">MATCHED · {intel.duplicate.ref}</div>
                  <div className="text-[13px] font-semibold">{intel.duplicate.vendor}</div>
                  <div className="mt-[3px] text-[11.5px] text-muted-foreground">
                    {intel.duplicate.date} · {formatINR(intel.duplicate.amount)}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs leading-[1.5] text-muted-foreground">{intel.duplicate.note}</p>
            </>
          )}
        </Card>
      </div>

      {intel.version > 1 && (
        <Card className="p-5">
          <div className="mb-3.5 flex items-center gap-2">
            <History className="size-4 text-blue-600" strokeWidth={2} />
            <span className="text-[15px] font-semibold">Resubmission · compare versions</span>
            <span className="ml-auto inline-flex h-5 items-center rounded-md bg-blue-600/10 px-2 text-[11px] font-semibold text-blue-600">
              {intel.versionHistory.length} prior {intel.versionHistory.length === 1 ? "version" : "versions"}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {intel.versionHistory
              .map((snap, idx) => {
                const next =
                  idx === intel.versionHistory.length - 1
                    ? {
                        versionNumber: intel.version,
                        amount: intel.claimed,
                        category: intel.category,
                        vendor: intel.vendor,
                        date: intel.date,
                        statusLabel: intel.statusLabel,
                      }
                    : intel.versionHistory[idx + 1];
                const rows = [
                  { label: "Amount", from: formatINR(snap.amount), to: formatINR(next.amount), changed: snap.amount !== next.amount },
                  { label: "Category", from: snap.category, to: next.category, changed: snap.category !== next.category },
                  { label: "Vendor", from: snap.vendor, to: next.vendor, changed: snap.vendor !== next.vendor },
                  { label: "Date", from: snap.date, to: next.date, changed: snap.date !== next.date },
                  { label: "Status", from: snap.statusLabel, to: next.statusLabel, changed: snap.statusLabel !== next.statusLabel },
                ];
                return { snap, next, rows };
              })
              // Most recent transition first.
              .reverse()
              .map(({ snap, next, rows }) => (
                <div key={snap.versionNumber} className="overflow-hidden rounded-lg border">
                  <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3.5 py-2 text-[12px] font-semibold">
                    <span>v{snap.versionNumber}</span>
                    <ArrowRight className="size-3 text-muted-foreground" strokeWidth={2} />
                    <span className="text-blue-600">
                      v{next.versionNumber}
                      {next.versionNumber === intel.version ? " · current" : ""}
                    </span>
                    <span className="ml-auto text-[11px] font-normal text-muted-foreground">Superseded {snap.supersededAt}</span>
                  </div>
                  <table className="w-full border-collapse text-[12.5px]">
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.label} className="border-b last:border-b-0">
                          <td className="w-[90px] px-3.5 py-[7px] text-muted-foreground">{r.label}</td>
                          <td className={cn("px-3.5 py-[7px]", r.changed && "font-semibold text-destructive")}>{r.from}</td>
                          <td className={cn("px-3.5 py-[7px]", r.changed && "font-semibold text-blue-600")}>{r.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t px-3.5 py-2.5 text-xs leading-[1.5] text-muted-foreground">
                    <span className="font-medium text-foreground">v{snap.versionNumber} decision:</span> {snap.decisionReason}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-[1.25fr_1fr] items-start gap-5">
        <Card className="p-5">
          <div className="mb-4 text-[15px] font-semibold">Audit trail</div>
          <div className="flex flex-col">
            {intel.audit.map((ev, i) => (
              <div key={i} className="grid grid-cols-[20px_1fr] gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-[3px] size-[11px] shrink-0 rounded-full", AUDIT_DOT[ev.kind])} />
                  {i < intel.audit.length - 1 && <span className="my-[3px] w-0.5 flex-1 bg-border" />}
                </div>
                <div className="pb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium">{ev.action}</span>
                    <span className="text-[11px] text-muted-foreground">{ev.actor}</span>
                    <span className="tabular ml-auto text-[11px] text-muted-foreground">{ev.time}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{ev.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-[15px] p-5" style={{ position: "sticky", top: 78 }}>
          <div className="text-[15px] font-semibold">HR decision</div>
          {!canDecide ? (
            <div className="flex items-center gap-2.5 rounded-lg bg-muted px-3.5 py-3">
              <StatusBadge status={intel.statusLabel} />
              <span className="text-[12.5px] text-muted-foreground">This claim has already been decided.</span>
            </div>
          ) : (
            <>
              <div className={cn("flex items-center gap-[9px] rounded-lg px-3.5 py-2.5", verdictMeta.bg)}>
                <ShieldCheck className="size-[15px] shrink-0" style={{ color: verdictMeta.color }} strokeWidth={2} />
                <span className="text-[12.5px]" style={{ color: verdictMeta.color }}>
                  AI recommendation: <strong>{verdictMeta.label}</strong>
                </span>
              </div>
              <div>
                <Label className="text-[12.5px]">Decision note (required to reject)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Recorded in the audit trail…"
                  className="min-h-16 rounded-[9px] text-[13px]"
                />
              </div>
              <div className="flex gap-2.5">
                <Button variant="destructive-outline" onClick={() => decide(false)} disabled={pending} className="flex-1">
                  Reject
                </Button>
                <Button onClick={() => decide(true)} disabled={pending} className="flex-1">
                  {pending ? "Saving…" : `Approve ${formatINR(intel.claimed)}`}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
