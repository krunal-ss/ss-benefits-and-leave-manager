import { Box } from "lucide-react";
import { cn } from "@/lib/cn";

export function BrandMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className ?? "size-[30px]",
      )}
    >
      <Box className={iconClassName ?? "size-[17px]"} strokeWidth={2.2} />
    </span>
  );
}
