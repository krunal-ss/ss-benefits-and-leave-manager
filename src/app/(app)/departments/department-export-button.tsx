"use client";

// KAN-80: per-department "Export CSV" — POSTs the currently applied
// role/leave-type filters plus this row's own department to
// /api/availability/export (scope: "department") and triggers a browser
// download, mirroring the heatmap's AvailabilityFilterBar export flow.
import { useTransition } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/components/providers";
import { cn } from "@/lib/cn";

export function DepartmentExportButton({
  department,
  date,
  role,
  leaveTypeId,
}: {
  department: string;
  date: string;
  role?: string;
  leaveTypeId?: string;
}) {
  const { flash } = useToast();
  const [exporting, startExport] = useTransition();

  function exportCsv() {
    startExport(async () => {
      try {
        const res = await fetch("/api/availability/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: "department",
            department,
            role: role || undefined,
            leaveTypeId: leaveTypeId || undefined,
            fromDate: date,
            toDate: date,
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
        a.download = `availability-${department}-${date}.csv`;
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
    <button
      type="button"
      onClick={exportCsv}
      disabled={exporting}
      aria-label={`Export ${department} availability CSV`}
      className={cn(
        "inline-flex h-[26px] cursor-pointer items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-[11.5px] font-medium text-foreground shadow-xs transition-colors hover:bg-accent",
        exporting && "pointer-events-none opacity-50",
      )}
    >
      <Download className="size-[12px]" strokeWidth={2} />
      {exporting ? "Exporting…" : "Export"}
    </button>
  );
}
