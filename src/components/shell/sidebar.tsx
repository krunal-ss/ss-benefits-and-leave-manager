"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, // KAN-186: recent activity icon
  BarChart3,
  Bell, // KAN-148: benefit reminders icon
  BellRing, // KAN-168: notification preferences icon
  BookOpen, // KAN-187: leave policies icon
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileText, // KAN-187: leave policy content settings icon
  Grid3x3, // KAN-75: availability heatmap icon
  History,
  LayoutDashboard,
  type LucideIcon,
  LogOut,
  Plus,
  Settings, // KAN-49: admin console icon
  SlidersHorizontal, // KAN-46
} from "lucide-react";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/app/login/actions";
import { canAccessPath, NAV_SECTIONS, ROLE_LABEL } from "@/server/users";
import type { AppRole } from "@/server/auth/rbac";
import { BrandMark } from "./brand";
import { Avatar } from "@/components/ui/avatar";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  submit: Plus,
  leave: CalendarDays,
  "settings-notifications": BellRing, // KAN-168
  approvals: ClipboardCheck,
  calendar: CalendarCheck,
  "calendar-hr": CalendarDays,
  availability: Grid3x3, // KAN-75
  "availability-hr": Grid3x3, // KAN-75
  expenses: FileCheck2,
  reminders: Bell, // KAN-148
  "expenses-history": History,
  reports: BarChart3,
  "expenses-export": Download,
  admin: Settings, // KAN-49
  "settings-approvals": SlidersHorizontal, // KAN-46
  activity: Activity, // KAN-186
  "leave-policy": BookOpen, // KAN-187
  "settings-leave-policy": FileText, // KAN-187
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Sidebar({
  user,
  approvalCount = 0,
}: {
  user: { name: string; email: string; role: AppRole };
  approvalCount?: number;
}) {
  const pathname = usePathname();

  // Only the sections/items this role is allowed to reach (server enforces too).
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => canAccessPath(user.role, i.href)),
  })).filter((s) => s.items.length > 0);

  return (
    <aside className="sticky top-0 flex h-screen w-[252px] shrink-0 flex-col border-r bg-sidebar px-3 py-[14px]">
      <div className="flex items-center gap-[9px] px-2 pt-1.5 pb-4">
        <BrandMark />
        <div className="flex flex-col leading-[1.25]">
          <span className="text-[13.5px] font-semibold tracking-[-0.01em]">SmartSense</span>
          <span className="text-[11px] text-muted-foreground">Benefits &amp; Leave</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <div className="px-2 py-1.5 text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
              {section.label}
            </div>
            {section.items.map(({ href, label, key }) => {
              const Icon = ICONS[key] ?? LayoutDashboard;
              const active = pathname === href;
              const badge = key === "approvals" ? approvalCount : undefined;
              return (
                <Link
                  key={key}
                  href={href}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                    active ? "bg-accent text-foreground" : "bg-transparent text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="size-4" strokeWidth={2} />
                  {label}
                  {badge !== undefined && badge > 0 && (
                    <span className="ml-auto rounded-full bg-primary px-[7px] py-px text-[11px] font-semibold text-primary-foreground">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t px-2 pt-2.5 pb-1">
        <Avatar initials={initialsOf(user.name)} tone="primary" className="size-8 text-xs" />
        <div className="flex min-w-0 flex-1 flex-col leading-[1.3]">
          <span className="truncate text-[12.5px] font-medium">{user.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
          <span className="truncate text-[11px] text-muted-foreground">{ROLE_LABEL[user.role]}</span>
        </div>
        <button
          onClick={() => signOutAction()}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] bg-transparent text-muted-foreground hover:bg-accent"
        >
          <LogOut className="size-4" strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
