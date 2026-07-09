"use client";

// KAN-186 — Recent activity feed with type/status/date-range filters, all
// applied client-side over the already-fetched (ownership-scoped) list —
// same "fetch once, filter locally" shape as the wallet ledger tab.
import { useMemo, useState } from "react";
import { CalendarDays, FileText, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import type { ActivityItem, ActivityStatusKind, ActivityType } from "@/server/employee/activity-feed";

type TypeFilter = "all" | ActivityType;
type StatusFilter = "all" | ActivityStatusKind;
type RangeFilter = "all" | "7d" | "30d" | "90d";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "leave", label: "Leave" },
  { value: "claim", label: "Claims" },
  { value: "wallet", label: "Wallet" },
];
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "info", label: "Info" },
];
const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const TYPE_ICON: Record<ActivityType, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  leave: CalendarDays,
  claim: FileText,
  wallet: Wallet,
};

const STATUS_CLS: Record<ActivityStatusKind, string> = {
  approved: "bg-emerald-500/[0.13] text-emerald-600",
  pending: "bg-amber-500/[0.15] text-amber-600",
  rejected: "bg-destructive/[0.12] text-destructive",
  info: "bg-muted text-muted-foreground",
};

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityClient({ items }: { items: ActivityItem[] }) {
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");

  const filtered = useMemo(() => {
    const cutoffDays = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
    const cutoffMs = cutoffDays ? Date.now() - cutoffDays * 24 * 3600e3 : null;
    return items.filter((it) => {
      if (type !== "all" && it.type !== type) return false;
      if (status !== "all" && it.status !== status) return false;
      if (cutoffMs !== null && new Date(it.iso).getTime() < cutoffMs) return false;
      return true;
    });
  }, [items, type, status, range]);

  const isFiltered = type !== "all" || status !== "all" || range !== "all";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Recent activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every update across your leave, expense claims and benefit wallet.
          </p>
        </div>
        <span className="ml-auto text-[12.5px] text-muted-foreground">
          {filtered.length} of {items.length}
        </span>
      </div>

      <Card className="flex flex-wrap items-center gap-5 px-4 py-3.5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Type</span>
          <Segmented ariaLabel="Filter by type" value={type} onChange={setType} options={TYPE_OPTIONS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Status</span>
          <Segmented ariaLabel="Filter by status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">When</span>
          <Segmented ariaLabel="Filter by date range" value={range} onChange={setRange} options={RANGE_OPTIONS} />
        </div>
      </Card>

      <Card className="overflow-hidden py-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-[46px] text-center">
            <span className="flex size-[42px] items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
              <CalendarDays className="size-5" strokeWidth={2} />
            </span>
            <div>
              <div className="text-[14px] font-medium">No activity matches these filters</div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                Try widening the type, status or time range.
              </div>
            </div>
            {isFiltered && (
              <button
                onClick={() => {
                  setType("all");
                  setStatus("all");
                  setRange("all");
                }}
                className="h-8 rounded-lg border bg-background px-3.5 text-[12.5px] font-medium shadow-xs hover:bg-accent"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((it) => {
            const Icon = TYPE_ICON[it.type];
            return (
              <div key={it.id} className="flex items-start gap-3.5 border-b border-border px-5 py-[15px] last:border-b-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
                  <Icon className="size-[17px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{it.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted-foreground">{it.detail}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`inline-flex h-5 items-center rounded-md px-2 text-[11px] font-medium ${STATUS_CLS[it.status]}`}>
                    {it.statusLabel}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">{fmtTimestamp(it.iso)}</span>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
