import { cn } from "@/lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[14px] border bg-card shadow-xs", className)}
      {...props}
    />
  );
}
