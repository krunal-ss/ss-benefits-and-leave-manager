"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, Plus, ShieldCheck, Users, X, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/providers";
import { saveApprovalPolicyAction } from "@/server/actions/approval-policy";
import { isValidEmail, type ApprovalPolicy } from "@/server/policy/approval-policy";
import { cn } from "@/lib/cn";

export function ApprovalPolicyForm({ policy }: { policy: ApprovalPolicy }) {
  const { flash } = useToast();
  const [routingMode, setRoutingMode] = useState<ApprovalPolicy["routingMode"]>(policy.routingMode);
  const [wfhMax, setWfhMax] = useState<string>(String(policy.wfhAutoApproveMaxDays));
  const [ccEmails, setCcEmails] = useState<string[]>(policy.ccEmails);
  const [ccDraft, setCcDraft] = useState("");
  const [requireCancellationApproval, setRequireCancellationApproval] = useState(
    policy.requireLeaveCancellationApproval,
  );
  const [pending, startTransition] = useTransition();

  const wfhMaxNum = useMemo(() => {
    const n = Number(wfhMax);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [wfhMax]);
  const autoApproveOn = wfhMaxNum > 0;

  function addCc() {
    const email = ccDraft.trim().toLowerCase();
    if (!email) return;
    if (!isValidEmail(email)) {
      flash("Enter a valid email address.", "warn");
      return;
    }
    if (ccEmails.includes(email)) {
      flash("That address is already on the CC list.", "warn");
      setCcDraft("");
      return;
    }
    setCcEmails((prev) => [...prev, email]);
    setCcDraft("");
  }

  function removeCc(email: string) {
    setCcEmails((prev) => prev.filter((e) => e !== email));
  }

  function save() {
    startTransition(async () => {
      const res = await saveApprovalPolicyAction({
        routingMode,
        wfhAutoApproveMaxDays: wfhMaxNum,
        ccEmails,
        requireLeaveCancellationApproval: requireCancellationApproval,
      });
      flash(res.message, res.ok ? "ok" : "warn");
    });
  }

  return (
    <div className="grid max-w-[900px] grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-5">
        {/* Routing mode */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold">Routing mode</div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                How a request moves through its two approvers.
              </p>
            </div>
            <Segmented
              ariaLabel="Routing mode"
              value={routingMode}
              onChange={setRoutingMode}
              options={[
                { value: "sequential", label: "Sequential" },
                { value: "parallel", label: "Parallel" },
              ]}
            />
          </div>
          <div className="rounded-[10px] border bg-muted/40 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {routingMode === "sequential" ? (
              <span>
                Team Lead approves first (L1), then the request advances to the Project Manager (L2).
                Both must approve.
              </span>
            ) : (
              <span>
                Team Lead and Project Manager are both notified at once — either one&apos;s approval
                finalises the request.
              </span>
            )}
          </div>
        </Card>

        {/* WFH auto-approve */}
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <div className="text-[15px] font-semibold">WFH auto-approve threshold</div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Short work-from-home requests within this many working days are approved automatically
              (still audited). Set to 0 to disable. Never applies to leave that deducts balance.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-32">
              <Label htmlFor="wfhMax">Max working days</Label>
              <Input
                id="wfhMax"
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={wfhMax}
                onChange={(e) => setWfhMax(e.target.value)}
              />
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-[9px] px-3 py-2 text-[12.5px]",
                autoApproveOn
                  ? "bg-emerald-500/[0.11] text-emerald-600"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Zap className="size-[15px] shrink-0" strokeWidth={2} />
              <span>
                {autoApproveOn
                  ? `WFH ≤ ${wfhMaxNum} day(s) auto-approved`
                  : "Auto-approve disabled"}
              </span>
            </div>
          </div>
        </Card>

        {/* KAN-127 — leave cancellation approval */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold">Leave cancellation approval</div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Whether cancelling an already-approved leave/WFH request needs the original approver&apos;s
                sign-off, or is applied immediately.
              </p>
            </div>
            <Segmented
              ariaLabel="Leave cancellation approval"
              value={requireCancellationApproval ? "required" : "immediate"}
              onChange={(v) => setRequireCancellationApproval(v === "required")}
              options={[
                { value: "required", label: "Needs approval" },
                { value: "immediate", label: "Immediate" },
              ]}
            />
          </div>
          <div
            className={cn(
              "flex items-center gap-2 rounded-[10px] border bg-muted/40 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground",
            )}
          >
            <ShieldCheck className="size-4 shrink-0" strokeWidth={2} />
            {requireCancellationApproval ? (
              <span>A cancellation request waits for the approver to accept it before the balance is restored.</span>
            ) : (
              <span>A cancellation is applied immediately and the balance is restored right away.</span>
            )}
          </div>
        </Card>

        {/* CC recipients */}
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <div className="text-[15px] font-semibold">Notification CC</div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              These addresses (e.g. HR, project team) are copied on every routing and decision email.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="ccDraft">Add email</Label>
              <Input
                id="ccDraft"
                type="email"
                placeholder="hr@company.com"
                value={ccDraft}
                onChange={(e) => setCcDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCc();
                  }
                }}
              />
            </div>
            <Button variant="outline" onClick={addCc} className="shrink-0">
              <Plus className="size-4" strokeWidth={2} />
              Add
            </Button>
          </div>
          {ccEmails.length === 0 ? (
            <div className="rounded-[10px] border border-dashed px-4 py-5 text-center text-[12.5px] text-muted-foreground">
              No CC recipients — only the approver and applicant are emailed.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ccEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1.5 pl-3 text-[12.5px]"
                >
                  {email}
                  <button
                    onClick={() => removeCc(email)}
                    aria-label={`Remove ${email}`}
                    className="flex size-[18px] cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X className="size-3.5" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="flex gap-2.5">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save policy"}
          </Button>
        </div>
      </div>

      {/* Live summary */}
      <div className="sticky top-[78px] flex h-fit flex-col gap-4">
        <Card className="flex flex-col gap-4 px-5 py-[18px]">
          <div className="text-sm font-semibold">Effective policy</div>

          <div className="flex flex-col gap-1">
            <div className="text-[11.5px] uppercase tracking-[0.03em] text-muted-foreground">Routing</div>
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <span className="rounded-md bg-muted px-2 py-0.5">Team Lead</span>
              {routingMode === "sequential" ? (
                <ArrowRight className="size-4 text-muted-foreground" strokeWidth={2} />
              ) : (
                <span className="text-[11.5px] text-muted-foreground">&amp;</span>
              )}
              <span className="rounded-md bg-muted px-2 py-0.5">Project Manager</span>
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {routingMode === "sequential" ? "Sequential · both approve in order" : "Parallel · either approves"}
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center gap-2.5">
            <Zap className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            <div className="text-[13px]">
              {autoApproveOn ? `WFH ≤ ${wfhMaxNum} day(s) auto-approved` : "WFH auto-approve off"}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Users className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
            <div className="text-[13px]">
              {ccEmails.length === 0
                ? "No notification CC"
                : `${ccEmails.length} CC recipient${ccEmails.length === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2 rounded-[9px] bg-muted/50 px-3 py-2 text-[11.5px] text-muted-foreground">
            <Check className="size-[14px] shrink-0" strokeWidth={2} />
            <span>Changes apply to requests submitted after saving.</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
