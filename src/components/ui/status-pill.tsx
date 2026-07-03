import { cn } from "@/lib/cn";

export function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-2 text-[11.5px] font-medium", className)}>
      {label}
    </span>
  );
}
