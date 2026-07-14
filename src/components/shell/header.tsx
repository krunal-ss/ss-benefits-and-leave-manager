"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/providers";
import { CommandPalette } from "./command-palette";

const CRUMB: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/submit": "Submit expense",
  "/leave": "Apply leave / WFH",
  "/approvals": "Approvals",
  "/calendar": "Team calendar",
  "/expenses": "Expense queue",
  "/activity": "Recent activity",
  "/leave-policy": "Leave policies",
  "/search": "Search",
  "/settings/leave-policy": "Leave policy content",
};

export function Header() {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const crumb = CRUMB[pathname] ?? "";
  const [paletteOpen, setPaletteOpen] = useState(false);

  // KAN-185 — ⌘K / Ctrl+K opens Quick Search from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-6 backdrop-blur-sm">
      <nav className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>SmartSense</span>
        <ChevronRight className="size-[13px]" />
        <span className="font-medium text-foreground">{crumb}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex h-[34px] items-center gap-2 rounded-lg border bg-background px-3 text-[12.5px] font-medium text-muted-foreground shadow-xs hover:bg-accent"
        >
          <Search className="size-[15px]" strokeWidth={2} />
          Quick search
          <kbd className="rounded-[5px] border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
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

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
