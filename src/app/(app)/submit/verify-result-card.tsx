import { Check, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CheckOutcome } from "@/server/actions/expense";

type Result = { status: "auto_approved" | "pending_hr"; checks: CheckOutcome[] };

export function VerifyResultCard({
  result,
  category,
  maxW,
  onReset,
}: {
  result: Result;
  category: string;
  maxW: string;
  onReset: () => void;
}) {
  const pass = result.status === "auto_approved";
  const today = new Date().toLocaleDateString("en-IN");
  return (
    <Card className="overflow-hidden shadow-sm" style={{ maxWidth: maxW }}>
      <div className={cn("flex items-center gap-3 border-b px-[22px] py-4", pass ? "bg-emerald-500/10" : "bg-amber-500/[0.11]")}>
        <span className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-full text-white", pass ? "bg-emerald-500" : "bg-amber-500")}>
          {pass ? <Check className="size-[18px]" strokeWidth={2.5} /> : <TriangleAlert className="size-[18px]" strokeWidth={2.5} />}
        </span>
        <div>
          <div className={cn("text-[15px] font-semibold", pass ? "text-emerald-500" : "text-amber-700")}>
            {pass ? "Auto-approved" : "Routed to HR Head"}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {pass
              ? `All checks passed — amount reserved against your ${category} balance.`
              : "One or more checks need a human decision. Extracted fields shared with HR."}
          </div>
        </div>
        <span className={cn("ml-auto inline-flex h-6 items-center rounded-[7px] px-2.5 text-xs font-semibold text-white", pass ? "bg-emerald-500" : "bg-amber-500")}>
          {pass ? "Auto-Approved" : "Pending HR Approval"}
        </span>
      </div>

      <div className="py-2">
        {result.checks.map((ck) => {
          const failColor = ck.label.includes("alance") || ck.label.includes("FY") ? "bg-destructive" : "bg-amber-500";
          return (
            <div key={ck.label} className="flex items-center gap-3 px-[22px] py-2.5">
              <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", ck.ok ? "bg-emerald-500" : failColor)}>
                {ck.ok ? "✓" : "!"}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">{ck.label}</div>
                <div className="text-xs text-muted-foreground">{ck.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5 border-t px-[22px] py-3.5">
        <span className="text-[12.5px] text-muted-foreground">
          {pass ? `Decision logged for audit · ${today}` : "Sent to Rohan Mehta (HR Head) · you’ll be notified by email."}
        </span>
        <Button variant="outline" size="sm" className="ml-auto h-8 px-3.5 text-[13px]" onClick={onReset}>
          New claim
        </Button>
      </div>
    </Card>
  );
}
