import type { DepartmentAvailabilityRow } from "@/server/hr/department-overview";

export function DepartmentStatusBadge({ row }: { row: DepartmentAvailabilityRow }) {
  if (row.availablePct === null) {
    return (
      <span className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
        Non-working day
      </span>
    );
  }
  if (row.belowThreshold) {
    return (
      <span className="rounded-full bg-red-600/10 px-2.5 py-1 text-[11.5px] font-medium text-red-600">At risk</span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-600">OK</span>
  );
}
