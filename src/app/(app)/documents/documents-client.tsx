"use client";

// KAN-224 — Client for the Employee Document Vault. Owns the upload draft state,
// calls the ownership-scoped server actions, and refreshes the server-fetched
// list on success. Downloads fetch a fresh short-lived signed URL on click
// (never baked into the page). Expiry reminder is an in-app card over documents
// whose derived status is "expiring" or "expired".
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, fieldBaseClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/format";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/document-categories";
import type { EmployeeDocumentItem, ExpiryStatus } from "@/server/employee/documents";
import {
  addEmployeeDocumentAction,
  deleteEmployeeDocumentAction,
  getEmployeeDocumentUrlAction,
  replaceEmployeeDocumentAction,
} from "@/server/actions/employee-documents";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXPIRY_BADGE: Record<Exclude<ExpiryStatus, "none">, { className: string; label: (d: EmployeeDocumentItem) => string }> = {
  expired: {
    className: "bg-destructive/12 text-destructive",
    label: () => "Expired",
  },
  expiring: {
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    label: (d) => `Expires in ${d.daysUntilExpiry}d`,
  },
  valid: {
    className: "bg-muted text-muted-foreground",
    label: (d) => (d.expiryDate ? `Valid to ${formatDateLong(d.expiryDate)}` : ""),
  },
};

export function DocumentsClient({ documents }: { documents: EmployeeDocumentItem[] }) {
  const router = useRouter();
  const { flash } = useToast();
  const [pending, startTransition] = useTransition();

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [expiryDate, setExpiryDate] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const expiringSoon = documents.filter((d) => d.expiryStatus === "expiring" || d.expiryStatus === "expired");

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

  function upload() {
    if (!file) {
      flash("Choose a PDF, JPG, or PNG file to upload.", "warn");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("category", category);
    fd.set("expiryDate", expiryDate);
    run(
      () => addEmployeeDocumentAction(fd),
      () => {
        setFile(null);
        setExpiryDate("");
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      },
    );
  }

  function onReplacePicked(picked: File | null) {
    if (!picked || !replaceTargetId) return;
    const fd = new FormData();
    fd.set("documentId", replaceTargetId);
    fd.set("file", picked);
    run(
      () => replaceEmployeeDocumentAction(fd),
      () => {
        setReplaceTargetId(null);
        if (replaceInputRef.current) replaceInputRef.current.value = "";
      },
    );
  }

  async function download(doc: EmployeeDocumentItem) {
    const url = await getEmployeeDocumentUrlAction(doc.id);
    if (!url) {
      flash("Could not open the document — try again.", "warn");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function remove(doc: EmployeeDocumentItem) {
    if (!window.confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    run(() => deleteEmployeeDocumentAction({ documentId: doc.id }));
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Hidden input reused for all row "Replace" actions */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => onReplacePicked(e.target.files?.[0] ?? null)}
      />

      {expiringSoon.length > 0 && (
        <Card className="flex items-start gap-3.5 border-amber-500/40 bg-amber-500/[0.08] p-4" role="status">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-[19px]" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold">
              {expiringSoon.length === 1
                ? "1 document needs attention"
                : `${expiringSoon.length} documents need attention`}
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Some documents have expired or expire within 30 days — replace them to keep your records current.
            </p>
            <div className="mt-[11px] flex flex-wrap gap-2">
              {expiringSoon.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex h-6 items-center gap-1.5 rounded-[7px] border bg-card px-2.5 text-xs font-medium"
                >
                  <CalendarClock className="size-3 text-amber-600 dark:text-amber-400" strokeWidth={2} />
                  {d.fileName} · {d.expiryStatus === "expired" ? "expired" : `${d.daysUntilExpiry}d`}
                </span>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Upload */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="text-[15px] font-semibold">Upload a document</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Label htmlFor="doc-file">File (PDF, JPG, PNG · max 10 MB)</Label>
            <input
              ref={uploadInputRef}
              id="doc-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={cn(
                fieldBaseClass,
                "h-[38px] cursor-pointer px-3 py-[7px] text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-medium",
              )}
            />
          </div>
          <div>
            <Label htmlFor="doc-category">Category</Label>
            <select
              id="doc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={cn(fieldBaseClass, "h-[38px] px-3 text-sm")}
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="doc-expiry">Expiry date (optional)</Label>
            <Input
              id="doc-expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Button onClick={upload} disabled={pending || !file}>
            <Upload className="size-[15px]" strokeWidth={2} />
            {pending ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      </Card>

      {/* List */}
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-4">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">Your documents</div>
          <div className="text-[12.5px] text-muted-foreground">
            {documents.length === 0 ? "Nothing stored yet" : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
          </div>
        </div>
        {documents.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-muted-foreground">
            Upload your first document to get started.
          </div>
        ) : (
          documents.map((doc) => {
            const badge = doc.expiryStatus === "none" ? null : EXPIRY_BADGE[doc.expiryStatus];
            return (
              <div key={doc.id} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-[16px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{doc.fileName}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex h-[18px] items-center rounded-md bg-muted px-1.5 font-medium">
                      {DOCUMENT_CATEGORY_LABELS[doc.category]}
                    </span>
                    <span>{formatBytes(doc.sizeBytes)}</span>
                    {badge && (
                      <span className={cn("inline-flex h-[18px] items-center rounded-md px-1.5 font-medium", badge.className)}>
                        {badge.label(doc)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => download(doc)} disabled={pending}>
                    <Download className="size-[14px]" strokeWidth={2} />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplaceTargetId(doc.id);
                      replaceInputRef.current?.click();
                    }}
                    disabled={pending}
                    aria-label={`Replace ${doc.fileName}`}
                  >
                    <RefreshCw className="size-[14px]" strokeWidth={2} />
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive-outline"
                    onClick={() => remove(doc)}
                    disabled={pending}
                    aria-label={`Delete ${doc.fileName}`}
                  >
                    <Trash2 className="size-[14px]" strokeWidth={2} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
