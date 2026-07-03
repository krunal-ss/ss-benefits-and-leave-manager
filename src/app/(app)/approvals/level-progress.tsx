import { cn } from "@/lib/cn";

export function LevelProgress({ l1done }: { l1done: boolean }) {
  return (
    <div className="flex items-center gap-2 border-y py-2.5">
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", l1done ? "text-emerald-500" : "text-foreground")}>
        <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
          {l1done ? "✓" : "•"}
        </span>
        L1 · Team Lead
      </span>
      <span className="h-px flex-1 bg-border" />
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", l1done ? "text-amber-700" : "text-muted-foreground")}>
        <span
          className={cn(
            "inline-flex size-[18px] items-center justify-center rounded-full border text-[10px] font-bold",
            l1done ? "border-amber-500 bg-amber-500 text-white" : "border-border bg-muted text-muted-foreground",
          )}
        >
          {l1done ? "•" : "2"}
        </span>
        L2 · Project Manager
      </span>
    </div>
  );
}
