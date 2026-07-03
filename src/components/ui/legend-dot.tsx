import { cn } from "@/lib/cn";

export function LegendDot({
  className,
  label,
  shape,
}: {
  className: string;
  label: string;
  /** availability's heatmap legend uses a circle; the calendar's event legend uses a square. */
  shape: "circle" | "square";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-[9px]", shape === "circle" ? "rounded-full" : "rounded-sm", className)} />
      {label}
    </span>
  );
}
