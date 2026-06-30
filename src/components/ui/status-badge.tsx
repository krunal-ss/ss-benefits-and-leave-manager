import { cn } from "@/lib/cn";
import type { ClaimStatus } from "@/server/benefits";

const STYLES: Record<ClaimStatus, string> = {
  "Auto-approved": "bg-emerald-500/15 text-emerald-500",
  Approved: "bg-emerald-500/15 text-emerald-500",
  "Pending HR": "bg-amber-500/15 text-amber-700",
  Reimbursed: "bg-muted text-muted-foreground",
  Rejected: "bg-red-500/15 text-destructive",
};

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-2 text-[11.5px] font-medium",
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
