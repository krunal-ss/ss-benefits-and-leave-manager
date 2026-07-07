"use client";

import { useState } from "react";
import { FileText, RefreshCw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Full-size, zoomable, rotatable preview of a not-yet-submitted receipt (KAN-166).
 * Zoom/rotate are client-side view transforms only — they never touch the file
 * bytes uploaded by `saveDraftAction`/`submitDraftAction`.
 */
export function ReceiptPreview({
  file,
  previewUrl,
  onReplace,
  onRemove,
}: {
  file: File;
  previewUrl: string | null;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  const canZoom = (isImage || isPdf) && !!previewUrl;

  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const rotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div className="overflow-hidden rounded-[10px] border bg-muted">
      <div className="flex items-center gap-1 border-b bg-background px-3 py-2">
        <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
        <div className="min-w-0 pr-2">
          <div className="truncate text-[12.5px] font-medium">{file.name}</div>
          <div className="text-[11px] text-muted-foreground">{fmtBytes(file.size)} · ready to verify</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={!canZoom || zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="w-8 px-0"
          >
            <ZoomOut className="size-[15px]" strokeWidth={2} />
          </Button>
          <span className="w-9 text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={!canZoom || zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="w-8 px-0"
          >
            <ZoomIn className="size-[15px]" strokeWidth={2} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={rotate}
            disabled={!canZoom}
            aria-label="Rotate 90 degrees"
            className="w-8 px-0"
          >
            <RotateCw className="size-[15px]" strokeWidth={2} />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onReplace}>
            <RefreshCw className="size-[13px]" strokeWidth={2} />
            Replace
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove file" className="w-8 px-0">
            <X className="size-[15px]" strokeWidth={2} />
          </Button>
        </div>
      </div>

      <div className="flex h-[280px] items-center justify-center overflow-auto bg-muted/60 p-3">
        {isImage && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL of a not-yet-uploaded file
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="max-h-full max-w-full object-contain transition-transform"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          />
        ) : isPdf && previewUrl ? (
          <iframe
            title="Receipt preview"
            src={previewUrl}
            className="h-full w-full rounded border bg-background transition-transform"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <FileText className="size-6" strokeWidth={1.8} />
            <span className="text-[12.5px]">No preview available</span>
          </div>
        )}
      </div>
    </div>
  );
}
