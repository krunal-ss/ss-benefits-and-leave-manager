"use client";

// KAN-207 — "suggestions appear automatically" (AC1): a row of the caller's
// own favorite vendors (pinned first, then most-used — see
// getFavoriteVendors) rendered under the vendor field. Pin state is
// optimistic-updated locally then persisted via toggleVendorPinAction;
// favorites are user-specific by construction (the server only ever loads
// the signed-in user's own rows — see AC2).
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { toggleVendorPinAction } from "@/server/actions/favorite-vendor";
import type { FavoriteVendor } from "@/server/employee/favorite-vendors";

export function FavoriteVendorChips({
  initialFavorites,
  onSelect,
}: {
  initialFavorites: FavoriteVendor[];
  onSelect: (vendorName: string) => void;
}) {
  const [favorites, setFavorites] = useState(initialFavorites);
  const [, startTransition] = useTransition();

  if (favorites.length === 0) return null;

  function togglePin(vendor: FavoriteVendor) {
    const nextPinned = !vendor.pinned;
    setFavorites((prev) => prev.map((v) => (v.id === vendor.id ? { ...v, pinned: nextPinned } : v)));
    startTransition(async () => {
      const res = await toggleVendorPinAction({ vendorId: vendor.id, pinned: nextPinned });
      if (!res.ok) setFavorites((prev) => prev.map((v) => (v.id === vendor.id ? { ...v, pinned: !nextPinned } : v)));
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11.5px] text-muted-foreground">Frequently used:</span>
      {favorites.map((v) => (
        <span
          key={v.id}
          className="inline-flex h-7 items-center gap-1 rounded-full border bg-background pl-2.5 pr-1 text-[12px] font-medium"
        >
          <button type="button" onClick={() => onSelect(v.vendorName)} className="cursor-pointer hover:text-foreground">
            {v.vendorName}
          </button>
          <button
            type="button"
            onClick={() => togglePin(v)}
            aria-label={v.pinned ? `Unpin ${v.vendorName}` : `Pin ${v.vendorName}`}
            aria-pressed={v.pinned}
            className="flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          >
            <Star className={cn("size-3", v.pinned && "fill-amber-500 text-amber-500")} strokeWidth={2} />
          </button>
        </span>
      ))}
    </div>
  );
}
