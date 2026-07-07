"use client";

// KAN-148 — Dashboard "unused benefit" reminder banner. Dismiss is CLIENT-ONLY
// transient state (useState, not persisted to the DB or localStorage) — the
// design's own dismiss behaviour is in-memory only, and there's no requirement
// to remember it across a reload/session.
import { useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { ReminderBannerData } from "@/server/employee/reminder-banner";

export function ReminderBanner({ data }: { data: ReminderBannerData }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3.5 rounded-[14px] border border-amber-500/40 bg-amber-500/[0.08] p-4 shadow-xs">
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400">
        <Bell className="size-[19px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-semibold">
            You have {formatINR(data.totalAvailablePaise / 100)} unused in your benefit wallet
          </span>
          <span className="inline-flex h-5 items-center rounded-md bg-amber-500/20 px-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {data.daysLeft} days left
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Unused balance does not carry over past{" "}
          <strong className="text-foreground">{data.fyEndLabel}</strong>. Submit your claims before FY-end
          to make the most of it.
        </p>
        <div className="mt-[11px] flex flex-wrap gap-2">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-[7px] border bg-card px-2.5 text-xs font-medium">
            <span className="size-[7px] rounded-sm bg-emerald-500" />
            Sports {formatINR(data.sportsAvailablePaise / 100)}
          </span>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-[7px] border bg-card px-2.5 text-xs font-medium">
            <span className="size-[7px] rounded-sm bg-blue-600" />
            Learning {formatINR(data.learningAvailablePaise / 100)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/submit"
          className="inline-flex h-[34px] items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-xs hover:opacity-90"
        >
          Submit a claim
        </Link>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss reminder"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-accent"
        >
          <X className="size-[15px]" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
