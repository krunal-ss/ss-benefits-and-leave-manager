"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { computeSla, type SlaState, type SlaView } from "@/server/sla";

const STATE_META: Record<SlaState, { color: string; bg: string }> = {
  ok: { color: "var(--emerald-500)", bg: "bg-emerald-500/[0.13]" },
  soon: { color: "#b45309", bg: "bg-amber-500/[0.16]" },
  overdue: { color: "var(--destructive)", bg: "bg-red-500/[0.13]" },
};

/**
 * Ticking SLA view for a single row — recomputes every second so a mounted
 * badge/row visibly counts down without a page refresh (KAN-147, replicates
 * the design mock's `componentDidMount`/`_slaTick` 1s `forceUpdate`).
 * The initial value is computed once with the SSR-safe `useState` initializer
 * so the server-rendered and first client-rendered markup agree — no
 * hydration mismatch — then ticks on every subsequent second after mount.
 */
export function useSla(createdAtIso: string, targetHours: number): SlaView {
  const [sla, setSla] = useState<SlaView>(() => computeSla(createdAtIso, targetHours));

  useEffect(() => {
    setSla(computeSla(createdAtIso, targetHours));
    const id = setInterval(() => setSla(computeSla(createdAtIso, targetHours)), 1000);
    return () => clearInterval(id);
  }, [createdAtIso, targetHours]);

  return sla;
}

type SlaBadgeProps = {
  createdAtIso: string;
  targetHours: number;
  className?: string;
  /**
   * "pill" (default) — compact badge for a table cell (HR expense queue).
   * "row" — fuller row with a target-hours label + progress bar, used on the
   * leave/WFH approval cards.
   */
  variant?: "pill" | "row";
  /** "row" variant only, e.g. "L1 · 24h SLA" / "L2 · 24h SLA". */
  targetLabel?: string;
};

/** Reused by both the HR expense queue table and the leave/WFH approval cards (KAN-147). */
export function SlaBadge({ createdAtIso, targetHours, className, variant = "pill", targetLabel }: SlaBadgeProps) {
  const sla = useSla(createdAtIso, targetHours);
  const meta = STATE_META[sla.state];

  if (variant === "row") {
    const barPct = Math.max(4, Math.min(100, sla.pct));
    return (
      <div className={cn("flex items-center gap-2.5 rounded-[9px] px-3 py-[9px]", meta.bg, className)}>
        <Clock className="size-[15px] shrink-0" style={{ color: meta.color }} strokeWidth={2} />
        <span className="tabular text-[12.5px] font-semibold" style={{ color: meta.color }}>
          {sla.label}
        </span>
        {targetLabel && <span className="text-[11.5px] text-muted-foreground">· {targetLabel}</span>}
        <span className="ml-auto h-1.5 w-[110px] shrink-0 overflow-hidden rounded-full bg-muted-foreground/[0.16]">
          <span className="block h-full rounded-full" style={{ width: `${barPct}%`, background: meta.color }} />
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn("tabular inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11.5px] font-semibold", meta.bg, className)}
      style={{ color: meta.color }}
    >
      <Clock className="size-3 shrink-0" strokeWidth={2} />
      {sla.label}
    </span>
  );
}
