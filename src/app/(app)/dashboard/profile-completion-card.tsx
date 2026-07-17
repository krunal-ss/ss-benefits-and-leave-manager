import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ProfileCompletion } from "@/server/employee/profile";

// KAN-223 — Dashboard nudge card. Server Component (no interactivity beyond
// links). Rendered by the dashboard only when the profile is incomplete
// (percent < 100), mirroring the reminder-banner "show only when actionable"
// pattern. Missing fields are click-through shortcuts into /profile.
export function ProfileCompletionCard({ completion }: { completion: ProfileCompletion }) {
  return (
    <Card className="flex items-start gap-3.5 border-blue-600/30 bg-blue-600/[0.06] p-4">
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-blue-600/15 text-blue-600 dark:text-blue-400">
        <UserRound className="size-[19px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-semibold">Complete your profile</span>
          <span
            data-testid="dashboard-profile-percent"
            className="tabular inline-flex h-5 items-center rounded-md bg-blue-600/15 px-2 text-[11px] font-semibold text-blue-700 dark:text-blue-400"
          >
            {completion.percent}% done
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Add the remaining {completion.missing.length === 1 ? "detail" : "details"} so your records stay
          accurate.
        </p>
        <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-blue-600/15">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${completion.percent}%` }} />
        </div>
        <div className="mt-[11px] flex flex-wrap gap-2">
          {completion.missing.map((f) => (
            <Link
              key={f.key}
              href="/profile"
              className="inline-flex h-6 items-center gap-1.5 rounded-[7px] border bg-card px-2.5 text-xs font-medium hover:bg-accent"
            >
              {f.label}
              <ArrowRight className="size-3" strokeWidth={2} />
            </Link>
          ))}
        </div>
      </div>
      <Link
        href="/profile"
        className="inline-flex h-[34px] shrink-0 items-center rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground shadow-xs hover:opacity-90"
      >
        Update profile
      </Link>
    </Card>
  );
}
