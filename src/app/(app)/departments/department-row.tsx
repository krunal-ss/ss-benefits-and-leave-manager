import Link from "next/link";
import type { DepartmentAvailabilityRow } from "@/server/hr/department-overview";
import { cn } from "@/lib/cn";
import { DepartmentStatusBadge } from "@/app/(app)/departments/department-status-badge";
import { DepartmentExportButton } from "@/app/(app)/departments/department-export-button";

/** Text color for the % available figure, same bands as the availability heatmap. */
function pctTextClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

export function DepartmentRow({
  row,
  date,
  role,
  leaveTypeId,
}: {
  row: DepartmentAvailabilityRow;
  date: string;
  role?: string;
  leaveTypeId?: string;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3 text-[13px] font-medium">{row.department}</td>
      <td className="px-4 py-3 text-[13px] tabular text-muted-foreground">{row.headcount}</td>
      <td className="px-4 py-3 text-[13px]">
        {row.availablePct === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="flex items-baseline gap-1.5">
            <span className={cn("font-semibold tabular", pctTextClass(row.availablePct))}>{row.availablePct}%</span>
            <span className="text-[11.5px] text-muted-foreground">
              {row.availableCount}/{row.headcount} available
            </span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-[13px] text-muted-foreground">
        {row.thresholdPercent === null
          ? "Not configured"
          : `${row.thresholdPercent}% (${row.thresholdSource === "department" ? "override" : "org default"})`}
      </td>
      <td className="px-4 py-3">
        <DepartmentStatusBadge row={row} />
      </td>
      <td className="px-4 py-3">
        {row.managers.length === 0 ? (
          <span className="text-[12.5px] text-muted-foreground">No manager on file</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.managers.map((m) => (
              <Link
                key={m.id}
                href={`/availability?team=${m.id}`}
                className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {m.name} heatmap →
              </Link>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <DepartmentExportButton department={row.department} date={date} role={role} leaveTypeId={leaveTypeId} />
      </td>
    </tr>
  );
}
