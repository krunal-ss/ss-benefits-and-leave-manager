import { cn } from "@/lib/cn";

/** A horizontal CSS bar row: label, value, and a proportional fill. */
export function BarRow({
  label,
  value,
  fraction,
  tone = "bg-foreground",
  sub,
}: {
  label: string;
  value: string;
  fraction: number;
  tone?: string;
  sub?: string;
}) {
  const width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {value}
          {sub ? <span className="ml-1.5 text-[11.5px]">{sub}</span> : null}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width }} />
      </div>
    </div>
  );
}
