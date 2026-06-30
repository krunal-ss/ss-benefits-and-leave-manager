"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Check, Dumbbell, FileText, GraduationCap, TriangleAlert, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/providers";
import { submitExpenseAction, type CheckOutcome } from "@/server/actions/expense";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";

type Variant = "single" | "split";
type CategoryKey = "sports" | "learning";
type Result = { status: "auto_approved" | "pending_hr"; checks: CheckOutcome[] };

const EMPTY = { amount: "", date: "2026-06-20", vendor: "" };

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors the server-side cap

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SubmitForm({
  sportsAvail,
  learningAvail,
  sportsCap,
  learningCap,
}: {
  sportsAvail: number;
  learningAvail: number;
  sportsCap: number;
  learningCap: number;
}) {
  const { flash } = useToast();
  const [category, setCategory] = useState<CategoryKey>("sports");
  const [claim, setClaim] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("single");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avail = category === "sports" ? sportsAvail : learningAvail;
  const cap = category === "sports" ? sportsCap : learningCap;
  const label = category === "sports" ? "Sports" : "Learning";
  const amt = useMemo(
    () => parseFloat(String(claim.amount).replace(/[^0-9.]/g, "")) || 0,
    [claim.amount],
  );
  const after = avail - amt;

  const setField = (patch: Partial<typeof claim>) => {
    setClaim((c) => ({ ...c, ...patch }));
    setResult(null);
  };
  const pickCategory = (key: CategoryKey) => {
    setCategory(key);
    setResult(null);
  };

  const clearPreview = () => {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  };

  const pickFile = (f: File | null) => {
    clearPreview();
    setResult(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) {
      flash("Unsupported file — upload a PDF, JPG, or PNG.", "warn");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      flash("File too large — receipts must be under 10 MB.", "warn");
      setFile(null);
      return;
    }
    setFile(f);
    if (f.type.startsWith("image/")) setPreviewUrl(URL.createObjectURL(f));
  };

  const removeFile = () => {
    clearPreview();
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const amountHint =
    amt > avail
      ? `Exceeds available ${formatINR(avail)} — will route to HR`
      : amt > 0
        ? `${formatINR(after)} will remain`
        : `${formatINR(avail)} available in ${label}`;

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("category", category);
      fd.set("amountRupees", String(amt));
      fd.set("date", claim.date);
      fd.set("vendor", claim.vendor);
      if (file) fd.set("receipt", file);
      const res = await submitExpenseAction(fd);
      if (!res.ok || !res.status || !res.checks) {
        flash(res.error ?? "Could not submit the claim", "warn");
        return;
      }
      setResult({ status: res.status, checks: res.checks });
      flash(
        res.status === "auto_approved"
          ? "Claim auto-approved — balance updated"
          : "Routed to HR Head for manual review",
        res.status === "auto_approved" ? "ok" : "warn",
      );
    });
  }

  function reset() {
    setClaim(EMPTY);
    removeFile();
    setResult(null);
  }

  const maxW = variant === "split" ? "1000px" : "680px";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">Submit an expense claim</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a receipt and we&apos;ll try to auto-approve it against your benefit allowance.
          </p>
        </div>
        <div className="ml-auto inline-flex flex-col items-end gap-1.5">
          <span className="text-[11px] text-muted-foreground">Layout</span>
          <Segmented
            ariaLabel="Form layout"
            value={variant}
            onChange={setVariant}
            options={[
              { value: "single", label: "Single column" },
              { value: "split", label: "Split + live check" },
            ]}
          />
        </div>
      </div>

      <div
        className="grid items-start gap-5"
        style={{ gridTemplateColumns: variant === "split" ? "1.5fr 1fr" : "1fr", maxWidth: maxW }}
      >
        <Card className="flex flex-col gap-[18px] px-6 py-[22px]">
          <div>
            <Label>Category</Label>
            <div className="flex gap-2">
              <CategoryButton
                active={category === "sports"}
                onClick={() => pickCategory("sports")}
                accent="emerald"
                icon={<Dumbbell className="size-[17px] text-emerald-500" strokeWidth={2} />}
                label="Sports"
                sub={`${formatINR(sportsAvail)} left`}
              />
              <CategoryButton
                active={category === "learning"}
                onClick={() => pickCategory("learning")}
                accent="blue"
                icon={<GraduationCap className="size-[17px] text-blue-600" strokeWidth={2} />}
                label="Learning"
                sub={`${formatINR(learningAvail)} left`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <Label>Amount (₹)</Label>
              <Input
                value={claim.amount}
                onChange={(e) => setField({ amount: e.target.value })}
                inputMode="numeric"
                placeholder="0"
              />
              <div className={cn("mt-1.5 text-[11.5px]", amt > avail ? "text-destructive" : "text-muted-foreground")}>
                {amountHint}
              </div>
            </div>
            <div>
              <Label>Date of expense</Label>
              <Input type="date" value={claim.date} onChange={(e) => setField({ date: e.target.value })} />
            </div>
          </div>

          <div>
            <Label>Vendor / description</Label>
            <Input
              value={claim.vendor}
              onChange={(e) => setField({ vendor: e.target.value })}
              placeholder="e.g. Cult.fit annual membership"
            />
          </div>

          <div>
            <Label>Supporting document</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-[10px] border bg-muted px-3.5 py-3">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="size-[34px] shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border bg-background text-red-600">
                    <FileText className="size-[17px]" strokeWidth={2} />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{file.name}</div>
                  <div className="text-[11.5px] text-muted-foreground">{fmtBytes(file.size)} · ready to verify</div>
                </div>
                <button
                  onClick={removeFile}
                  aria-label="Remove file"
                  className="ml-auto flex size-7 cursor-pointer items-center justify-center rounded-[7px] text-muted-foreground hover:bg-background"
                >
                  <X className="size-[15px]" strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center gap-[7px] rounded-[10px] border-[1.5px] border-dashed bg-background p-[22px] text-muted-foreground hover:bg-accent"
              >
                <Upload className="size-5" strokeWidth={2} />
                <span className="text-[13px] font-medium text-foreground">Click to upload receipt</span>
                <span className="text-[11.5px]">PDF, JPG or PNG · up to 10 MB</span>
              </button>
            )}
          </div>

          <div className="flex gap-2.5 pt-1">
            <Button onClick={submit} disabled={pending} className="flex-1">
              <Check className="size-4" strokeWidth={2} />
              {pending ? "Verifying…" : "Run verification & submit"}
            </Button>
            <Button variant="outline" onClick={reset}>
              Clear
            </Button>
          </div>
        </Card>

        {variant === "split" && (
          <div className="sticky top-[78px] flex flex-col gap-4">
            <Card className="flex flex-col gap-3.5 px-5 py-[18px]">
              <div className="text-sm font-semibold">Balance impact · {label}</div>
              <div className="flex flex-col gap-[9px] text-[13px]">
                <Row label="Available now" value={formatINR(avail)} />
                <Row label="This claim" value={`− ${formatINR(amt)}`} />
                <div className="h-px bg-border" />
                <div className="flex justify-between font-semibold">
                  <span>Remaining after</span>
                  <span className={cn("tabular", after < 0 ? "text-destructive" : "text-emerald-500")}>
                    {formatINR(Math.max(after, 0))}
                  </span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full", after < 0 ? "bg-destructive" : "bg-emerald-500")}
                  style={{ width: `${Math.max(0, Math.min(100, Math.round((Math.max(after, 0) / cap) * 100)))}%` }}
                />
              </div>
            </Card>
            <div className="rounded-[14px] border bg-muted px-[18px] py-4 text-[12.5px] leading-[1.55] text-muted-foreground">
              <strong className="font-semibold text-foreground">How auto-approval works.</strong> We OCR
              the receipt, match the amount, confirm it&apos;s within the current FY, check your balance,
              and sanity-check the vendor against the category. All green → approved instantly. Any flag →
              routed to HR.
            </div>
          </div>
        )}
      </div>

      {result && <VerifyResultCard result={result} category={label} maxW={maxW} onReset={reset} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  accent,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  accent: "emerald" | "blue";
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-14 flex-1 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3.5 text-left",
        active
          ? accent === "emerald"
            ? "border-emerald-500 bg-emerald-500/10"
            : "border-blue-600 bg-blue-600/10"
          : "border-border bg-background",
      )}
    >
      {icon}
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

function VerifyResultCard({
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
