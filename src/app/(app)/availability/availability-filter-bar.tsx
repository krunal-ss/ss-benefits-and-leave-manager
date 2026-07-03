"use client";

// KAN-80: filter bar (role / leave type / date range) for the heatmap, wired
// via URL search params (same convention as `m`/`team` — see hrefFor/
// hrefForDate in page.tsx) so the Server Component re-fetches a filtered
// view, plus an "Export CSV" button that POSTs the same filters to
// /api/availability/export and triggers a browser download.
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { useToast } from "@/components/providers";
import { cn } from "@/lib/cn";
import type { AppRole } from "@/server/auth/rbac";

const fieldCls =
  "h-[30px] rounded-lg border border-input bg-background px-2.5 text-[12.5px] shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "team_lead", label: "Team Lead" },
  { value: "project_manager", label: "Project Manager" },
  { value: "hr_head", label: "HR Head" },
  { value: "admin", label: "Admin" },
];

export function AvailabilityFilterBar({
  leaveTypes,
  role,
  leaveTypeId,
  from,
  to,
  teamId,
}: {
  leaveTypes: { id: string; name: string }[];
  role: string;
  leaveTypeId: string;
  from: string;
  to: string;
  teamId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { flash } = useToast();
  const [exporting, startExport] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/availability?${next.toString()}`, { scroll: false });
  }

  function exportCsv() {
    startExport(async () => {
      try {
        const res = await fetch("/api/availability/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "team",
            teamId: teamId || undefined,
            role: role || undefined,
            leaveTypeId: leaveTypeId || undefined,
            fromDate: from,
            toDate: to,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          flash(body?.error ?? "Export failed.", "warn");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `availability-${from}_${to}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        flash("Export failed.", "warn");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2.5 rounded-xl border bg-card px-3.5 py-3">
      <div>
        <label htmlFor="availabilityRoleFilter" className={labelCls}>
          Role
        </label>
        <select
          id="availabilityRoleFilter"
          className={fieldCls}
          value={role}
          onChange={(e) => setParam("role", e.target.value)}
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="availabilityLeaveTypeFilter" className={labelCls}>
          Leave type
        </label>
        <select
          id="availabilityLeaveTypeFilter"
          className={fieldCls}
          value={leaveTypeId}
          onChange={(e) => setParam("leaveType", e.target.value)}
        >
          <option value="">All types</option>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="availabilityFromFilter" className={labelCls}>
          From
        </label>
        <input
          id="availabilityFromFilter"
          type="date"
          className={fieldCls}
          value={from}
          max={to || undefined}
          onChange={(e) => setParam("from", e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="availabilityToFilter" className={labelCls}>
          To
        </label>
        <input
          id="availabilityToFilter"
          type="date"
          className={fieldCls}
          value={to}
          min={from || undefined}
          onChange={(e) => setParam("to", e.target.value)}
        />
      </div>
      <button
        type="button"
        onClick={exportCsv}
        disabled={exporting}
        className={cn(
          "ml-auto inline-flex h-[30px] cursor-pointer items-center justify-center gap-2 rounded-[7px] border bg-background px-[11px] text-[12.5px] font-medium text-foreground shadow-xs transition-colors hover:bg-accent",
          exporting && "pointer-events-none opacity-50",
        )}
      >
        <Download className="size-[14px]" strokeWidth={2} />
        {exporting ? "Exporting…" : "Export CSV"}
      </button>
    </div>
  );
}
