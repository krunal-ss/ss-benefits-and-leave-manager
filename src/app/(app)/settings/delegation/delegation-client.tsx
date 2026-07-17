"use client";

// KAN-225 — Client for the delegation settings screen. Create a delegation
// (delegate + scope + date range) and cancel an active one; both go through the
// ownership-scoped server actions, flash the result, and refresh the list.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, fieldBaseClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/format";
import { createDelegationAction, cancelDelegationAction } from "@/server/actions/delegation";
import type { DelegateCandidate, DelegationScope, MyDelegation } from "@/server/manager/delegation";

const SCOPE_OPTIONS: { value: DelegationScope; label: string }[] = [
  { value: "both", label: "Leave & Expenses" },
  { value: "leave", label: "Leave & WFH" },
  { value: "expense", label: "Expenses" },
];
const SCOPE_LABEL: Record<DelegationScope, string> = {
  both: "Leave & Expenses",
  leave: "Leave & WFH",
  expense: "Expenses",
};
const EFFECTIVE_BADGE: Record<MyDelegation["effective"], string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  upcoming: "bg-blue-600/12 text-blue-700 dark:text-blue-400",
  expired: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function DelegationClient({
  delegations,
  candidates,
  today,
}: {
  delegations: MyDelegation[];
  candidates: DelegateCandidate[];
  today: string;
}) {
  const router = useRouter();
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();

  const [delegateId, setDelegateId] = useState("");
  const [scope, setScope] = useState<DelegationScope>("both");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  function run(fn: () => Promise<{ ok: boolean; message: string }>, onOk?: () => void) {
    startTransition(async () => {
      const res = await fn();
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) {
        onOk?.();
        router.refresh();
      }
    });
  }

  function create() {
    if (!delegateId) {
      flash("Choose a delegate.", "warn");
      return;
    }
    run(
      () => createDelegationAction({ delegateId, scope, startDate, endDate }),
      () => setDelegateId(""),
    );
  }

  return (
    <div className="grid max-w-[1000px] grid-cols-1 items-start gap-[18px] lg:grid-cols-[1fr_1.3fr]">
      {/* Create */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="text-[15px] font-semibold">New delegation</div>
        <div>
          <Label htmlFor="del-delegate">Delegate</Label>
          <select
            id="del-delegate"
            value={delegateId}
            onChange={(e) => setDelegateId(e.target.value)}
            className={cn(fieldBaseClass, "h-[38px] px-3 text-sm")}
          >
            <option value="">Select a colleague…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="del-scope">Covers</Label>
          <select
            id="del-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as DelegationScope)}
            className={cn(fieldBaseClass, "h-[38px] px-3 text-sm")}
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="del-start">From</Label>
            <Input id="del-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="del-end">To</Label>
            <Input id="del-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Button onClick={create} disabled={pending}>
            <UserCog className="size-[15px]" strokeWidth={2} />
            {pending ? "Saving…" : "Delegate approvals"}
          </Button>
        </div>
      </Card>

      {/* Existing */}
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-4">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Your delegations</div>
          <div className="text-[12.5px] text-muted-foreground">
            {delegations.length === 0 ? "None yet" : `${delegations.length} total`}
          </div>
        </div>
        {delegations.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            You haven&apos;t delegated your approvals to anyone.
          </div>
        ) : (
          delegations.map((d) => (
            <div key={d.id} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-medium">{d.delegateName}</span>
                  <span className={cn("inline-flex h-[18px] items-center rounded-md px-1.5 text-[11px] font-medium capitalize", EFFECTIVE_BADGE[d.effective])}>
                    {d.effective}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {SCOPE_LABEL[d.scope]} · {formatDateLong(d.startDate)} – {formatDateLong(d.endDate)}
                </div>
              </div>
              {d.effective === "active" || d.effective === "upcoming" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(() => cancelDelegationAction({ id: d.id }))}
                  disabled={pending}
                  aria-label={`Cancel delegation to ${d.delegateName}`}
                >
                  <X className="size-[14px]" strokeWidth={2} />
                  Cancel
                </Button>
              ) : null}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
