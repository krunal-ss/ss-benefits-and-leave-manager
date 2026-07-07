"use client";

import { cn } from "@/lib/cn";

/** A small on/off toggle (shadcn has no bundled Switch in this repo yet — built to match its token conventions). */
export function Switch({
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-xs transition-transform",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}
