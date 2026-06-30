import { cn } from "@/lib/cn";

/** Round initials chip. `tone="primary"` for the signed-in user, else muted. */
export function Avatar({
  initials,
  className,
  tone = "muted",
}: {
  initials: string;
  className?: string;
  tone?: "primary" | "muted";
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        tone === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground",
        className ?? "size-8 text-xs",
      )}
    >
      {initials}
    </span>
  );
}
