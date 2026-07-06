"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Dumbbell, FileText, GraduationCap, Save, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/providers";
import { submitExpenseAction, type CheckOutcome } from "@/server/actions/expense";
import { saveDraftAction, submitDraftAction } from "@/server/actions/draft-expense";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Row } from "@/app/(app)/submit/balance-row";
import { CategoryButton } from "@/app/(app)/submit/category-button";
import { VerifyResultCard } from "@/app/(app)/submit/verify-result-card";

type Variant = "single" | "split";
type CategoryKey = "sports" | "learning";
type Result = { status: "auto_approved" | "pending_hr"; checks: CheckOutcome[] };

export type DraftPrefill = {
  id: string;
  category: CategoryKey | null;
  amountRupees: number | null;
  date: string | null;
  vendor: string | null;
  hasDocument: boolean;
};

const EMPTY = { amount: "", date: "2026-06-20", vendor: "" };

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors the server-side cap
const AUTOSAVE_DEBOUNCE_MS = 1500;

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
  draft,
}: {
  sportsAvail: number;
  learningAvail: number;
  sportsCap: number;
  learningCap: number;
  draft?: DraftPrefill | null;
}) {
  const { flash } = useToast();
  const [category, setCategory] = useState<CategoryKey>(draft?.category ?? "sports");
  const [claim, setClaim] = useState({
    amount: draft?.amountRupees ? String(draft.amountRupees) : EMPTY.amount,
    date: draft?.date ?? EMPTY.date,
    vendor: draft?.vendor ?? EMPTY.vendor,
  });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("single");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitTried, setSubmitTried] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // KAN-125 — draft save/autosave/resume. `draftIdRef` is the source of truth read
  // by every server call; `draftId` state only drives rendering. Autosave calls are
  // serialized through `autosaveChain` and an explicit Save/Submit always cancels
  // any pending timer and awaits the chain first — otherwise a slow autosave whose
  // response hasn't landed yet (stale `draftId` closure) can create a SECOND draft
  // row instead of updating the first one.
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const draftIdRef = useRef<string | null>(draft?.id ?? null);
  const [hasExistingDocument, setHasExistingDocument] = useState(draft?.hasDocument ?? false);
  const [autosavedAt, setAutosavedAt] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const skipNextAutosave = useRef(true); // don't autosave on initial mount
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveChain = useRef<Promise<void>>(Promise.resolve());

  function setDraftIdBoth(id: string | null) {
    draftIdRef.current = id;
    setDraftId(id);
  }

  const descriptionMissing = claim.vendor.trim().length === 0;
  const fileMissing = !file && !hasExistingDocument;

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
    setHasExistingDocument(false); // a freshly-picked file replaces whatever was stored
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

  function buildFormData(idOverride: string | null) {
    const fd = new FormData();
    fd.set("category", category);
    fd.set("amountRupees", String(amt));
    fd.set("date", claim.date);
    fd.set("vendor", claim.vendor);
    if (file) fd.set("receipt", file);
    if (idOverride) fd.set("draftId", idOverride);
    return fd;
  }

  // Silent background autosave — debounced, and only once there's something worth
  // keeping (an empty form autosaving on page load would just litter drafts).
  // Runs are chained through `autosaveChain` so a slow save can never overlap with
  // the next one and race on which row is "the" draft.
  useEffect(() => {
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (result) return; // just finalized — nothing left to autosave
    const hasContent = amt > 0 || claim.vendor.trim().length > 0 || !!file;
    if (!hasContent) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveChain.current = autosaveChain.current.then(async () => {
        try {
          const res = await saveDraftAction(buildFormData(draftIdRef.current));
          if (res.ok) {
            if (res.draftId) setDraftIdBoth(res.draftId);
            setAutosavedAt("just now");
          }
        } catch {
          // best-effort — autosave failures shouldn't interrupt typing
        }
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, claim.amount, claim.date, claim.vendor, file, result]);

  /** Cancel any pending debounce and wait for an in-flight autosave to finish, so an explicit Save/Submit always sees the true current draft id. */
  async function settleAutosave() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    await autosaveChain.current;
  }

  function submit() {
    setSubmitTried(true);
    if (descriptionMissing || fileMissing) return;
    startTransition(async () => {
      await settleAutosave();
      const id = draftIdRef.current;
      const fd = buildFormData(id);
      const res = id ? await submitDraftAction(fd) : await submitExpenseAction(fd);
      if (!res.ok || !res.status || !res.checks) {
        flash(res.error ?? "Could not submit the claim", "warn");
        return;
      }
      setResult({ status: res.status, checks: res.checks });
      setDraftIdBoth(null); // finalized — no longer a draft
      setHasExistingDocument(false);
      flash(
        res.status === "auto_approved"
          ? "Claim auto-approved — balance updated"
          : "Routed to HR Head for manual review",
        res.status === "auto_approved" ? "ok" : "warn",
      );
    });
  }

  function saveDraft() {
    setSavingDraft(true);
    startTransition(async () => {
      await settleAutosave();
      const res = await saveDraftAction(buildFormData(draftIdRef.current));
      setSavingDraft(false);
      if (!res.ok) {
        flash(res.error ?? "Could not save the draft", "warn");
        return;
      }
      flash("Draft saved — no balance reserved", "ok");
      reset();
    });
  }

  function reset() {
    setCategory("sports");
    setClaim(EMPTY);
    removeFile();
    setResult(null);
    setSubmitTried(false);
    setDraftIdBoth(null);
    setHasExistingDocument(false);
    setAutosavedAt(null);
    skipNextAutosave.current = true;
  }

  const maxW = variant === "split" ? "1000px" : "680px";
  const isEditingDraft = !!draftId && !result;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.02em]">
            {isEditingDraft ? "Edit draft" : "Submit an expense claim"}
          </h1>
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

      {isEditingDraft && (
        <div
          className="flex items-center gap-2.5 rounded-[11px] border border-border bg-muted px-[15px] py-3 text-[13px]"
          style={{ maxWidth: maxW }}
        >
          <FileText className="size-[17px] shrink-0 text-muted-foreground" strokeWidth={2} />
          <div>
            Editing draft <span className="font-semibold">{draftId!.slice(0, 8)}</span> · drafts don&apos;t
            reserve balance until you submit.
          </div>
        </div>
      )}

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
              <Label htmlFor="claimAmount">Amount (₹)</Label>
              <Input
                id="claimAmount"
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
              <Label htmlFor="claimDate">Date of expense</Label>
              <Input id="claimDate" type="date" value={claim.date} onChange={(e) => setField({ date: e.target.value })} />
            </div>
          </div>

          <div>
            <Label htmlFor="claimVendor">
              Vendor / description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="claimVendor"
              value={claim.vendor}
              onChange={(e) => setField({ vendor: e.target.value })}
              placeholder="e.g. Cult.fit annual membership"
              aria-invalid={submitTried && descriptionMissing}
              aria-required
            />
            {submitTried && descriptionMissing && (
              <p className="mt-1.5 text-[12px] text-destructive">A description is required.</p>
            )}
          </div>

          <div>
            <Label htmlFor="claimReceipt">
              Supporting document <span className="text-destructive">*</span>
            </Label>
            <input
              id="claimReceipt"
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
            ) : hasExistingDocument ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-muted px-3.5 py-3 text-left"
              >
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                  <FileText className="size-[17px]" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Receipt on file</div>
                  <div className="text-[11.5px] text-muted-foreground">Click to replace it with a new file</div>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center gap-[7px] rounded-[10px] border-[1.5px] border-dashed p-[22px] text-muted-foreground",
                  submitTried && fileMissing
                    ? "border-destructive bg-destructive/5 hover:bg-destructive/10"
                    : "bg-background hover:bg-accent",
                )}
              >
                <Upload className={cn("size-5", submitTried && fileMissing && "text-destructive")} strokeWidth={2} />
                <span className={cn("text-[13px] font-medium", submitTried && fileMissing ? "text-destructive" : "text-foreground")}>
                  Click to upload receipt
                </span>
                <span className="text-[11.5px]">PDF, JPG or PNG · up to 10 MB</span>
              </button>
            )}
            {submitTried && fileMissing && (
              <p className="mt-1.5 text-[12px] text-destructive">A supporting document is required.</p>
            )}
          </div>

          <div className="flex gap-2.5 pt-1">
            <Button onClick={submit} disabled={pending} className="flex-1">
              <Check className="size-4" strokeWidth={2} />
              {pending && !savingDraft ? "Verifying…" : "Run verification & submit"}
            </Button>
            <Button variant="outline" onClick={saveDraft} disabled={pending}>
              <Save className="size-4" strokeWidth={2} />
              {savingDraft ? "Saving…" : "Save draft"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={pending}>
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Save className="size-[13px]" strokeWidth={2} />
            {autosavedAt ? `Autosaved · ${autosavedAt}` : "Not saved yet"}
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
