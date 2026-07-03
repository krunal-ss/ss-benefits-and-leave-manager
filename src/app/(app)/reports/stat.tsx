import { cn } from "@/lib/cn";

export function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[10px] border px-3 py-2.5">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className={cn("tabular text-lg font-semibold", tone)}>{value}</div>
    </div>
  );
}
