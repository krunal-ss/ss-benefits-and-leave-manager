import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function MonthNavButton({ href, dir }: { href: string | null; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = dir === "prev" ? "Previous month" : "Next month";
  const base = "flex size-8 items-center justify-center rounded-lg border";
  if (!href) {
    return (
      <span aria-disabled className={cn(base, "cursor-not-allowed text-muted-foreground/40")}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(base, "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground")}>
      <Icon className="size-4" strokeWidth={2} />
    </Link>
  );
}
