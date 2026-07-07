"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA Tabs pattern: only the active tab is in the Tab order; arrow
  // keys move focus + selection across the rest (roving tabindex).
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % options.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;

    e.preventDefault();
    onChange(options[next].value);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-[3px] rounded-lg bg-muted p-[3px]"
    >
      {options.map((opt, index) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "h-[26px] cursor-pointer rounded-md px-[11px] text-[12.5px] font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-xs"
                : "bg-transparent text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
