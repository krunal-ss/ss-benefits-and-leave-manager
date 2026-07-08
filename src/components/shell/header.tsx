"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers";

const CRUMB: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/submit": "Submit expense",
  "/leave": "Apply leave / WFH",
  "/approvals": "Approvals",
  "/calendar": "Team calendar",
  "/expenses": "Expense queue",
};

export function Header() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const crumb = CRUMB[pathname] ?? "";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-6 backdrop-blur-sm">
      <nav className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>SmartSense</span>
        <ChevronRight className="size-[13px]" />
        <span className="font-medium text-foreground">{crumb}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="inline-flex size-[34px] cursor-pointer items-center justify-center rounded-lg border bg-background text-foreground shadow-xs hover:bg-accent"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <div className="inline-flex size-[34px] items-center justify-center rounded-lg border bg-background shadow-xs">
          <Bell aria-hidden="true" className="size-4" />
        </div>
      </div>
    </header>
  );
}
