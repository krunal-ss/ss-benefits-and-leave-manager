import { History } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "This claim was resubmitted" signal (KAN-126/KAN-136). Callers gate
 * rendering on `version > 1` — this component just draws the pill.
 */
export function VersionBadge({ version, className }: { version: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center gap-1 rounded-md bg-blue-600/10 px-1.5 text-[10.5px] font-semibold text-blue-600",
        className,
      )}
    >
      <History className="size-[10px]" strokeWidth={2.4} />v{version}
    </span>
  );
}
