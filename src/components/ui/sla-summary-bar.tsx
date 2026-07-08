import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "Review SLA" / "SLA status" summary bar (KAN-147) — on-track/due-soon/
 * overdue pill counts, plus an informational escalation note shown only when
 * something is overdue. Shared by the HR expense queue and the leave/WFH
 * approvals page so the two surfaces never drift out of sync visually.
 *
 * Counts are a server-computed snapshot (see `getHrExpenseSlaSummary` /
 * `getApprovalSlaSummary`), not live-ticking — only the per-row `<SlaBadge>`
 * ticks every second; the bar refreshes on next navigation/`router.refresh()`.
 */
export function SlaSummaryBar({
  label,
  ok,
  soon,
  over,
  escalationNote,
  className,
}: {
  label: string;
  ok: number;
  soon: number;
  over: number;
  /** Informational only — no automated escalation happens yet (KAN-155 follow-up). */
  escalationNote: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-xs", className)}>
      <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      <Pill count={ok} text="on track" dotClass="bg-emerald-500" pillClass="bg-emerald-500/[0.13] text-emerald-500" />
      <Pill count={soon} text="due soon" dotClass="bg-amber-500" pillClass="bg-amber-500/[0.16] text-amber-700" />
      <Pill count={over} text="overdue" dotClass="bg-destructive" pillClass="bg-red-500/[0.13] text-destructive" />
      {over > 0 && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" strokeWidth={2} />
          {escalationNote}
        </span>
      )}
    </div>
  );
}

function Pill({ count, text, dotClass, pillClass }: { count: number; text: string; dotClass: string; pillClass: string }) {
  return (
    <span className={cn("tabular inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-[11px] text-[12.5px] font-medium", pillClass)}>
      <span className={cn("size-[7px] rounded-full", dotClass)} />
      {count} {text}
    </span>
  );
}
