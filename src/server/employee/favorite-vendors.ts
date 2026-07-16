// KAN-207 — Favorite Expense Vendors. Suggestions shown on the submit form
// (pinned first, then most-used) and the usage-count increment hooked into
// claim finalize (see expense-pipeline.ts's verifyAndScoreClaim) — never on
// draft save (src/server/actions/draft-expense.ts's saveDraftAction never
// calls that pipeline).
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { favoriteVendors } from "@/db/schema";

export type FavoriteVendor = { id: string; vendorName: string; usageCount: number; pinned: boolean };

const SUGGESTION_LIMIT = 8;

/**
 * Max stored length of a vendor name. Matches the repo's short-label cap (e.g.
 * staffingThreshold.scopeValue). The finalize schemas import this to reject over-long
 * input up front; recordVendorUsage also slices to it as a last-line backstop.
 */
export const MAX_VENDOR_NAME_LENGTH = 120;

/** This user's favorite vendors — pinned first, then by usage — for the submit form's suggestion chips. */
export async function getFavoriteVendors(userId: string): Promise<FavoriteVendor[]> {
  const db = getDb();
  return db
    .select({
      id: favoriteVendors.id,
      vendorName: favoriteVendors.vendorName,
      usageCount: favoriteVendors.usageCount,
      pinned: favoriteVendors.pinned,
    })
    .from(favoriteVendors)
    .where(eq(favoriteVendors.userId, userId))
    .orderBy(desc(favoriteVendors.pinned), desc(favoriteVendors.usageCount))
    .limit(SUGGESTION_LIMIT);
}

/**
 * Bump (or create) this vendor's usage count for the user. Called once per finalized
 * claim, and only after the caller's own claim write has already succeeded (never from
 * inside the verification pipeline itself, so a bookkeeping failure here can't be
 * mistaken for — or block — a successful claim submission).
 *
 * Matching is keyed on `vendorKey` (lower-cased/trimmed) so "Cult.fit" and "cult.fit"
 * accumulate on the same row, and the insert/increment is a single atomic upsert
 * (`onConflictDoUpdate` against the `(userId, vendorKey)` unique index) so two
 * concurrent finalize calls for the same vendor can't race into duplicate rows.
 */
export async function recordVendorUsage(userId: string, vendorName: string): Promise<void> {
  // Backstop the length cap here too — this is the single write choke point, so even a
  // caller that skips the schema's .max() can't persist an over-long row. Slice (don't
  // reject): this runs after the claim is already persisted and is wrapped in .catch(),
  // so favorites bookkeeping must never throw or block a completed submission.
  const name = vendorName.trim().slice(0, MAX_VENDOR_NAME_LENGTH);
  if (!name) return;
  const key = name.toLowerCase();

  const db = getDb();
  await db
    .insert(favoriteVendors)
    .values({ userId, vendorName: name, vendorKey: key, usageCount: 1 })
    .onConflictDoUpdate({
      target: [favoriteVendors.userId, favoriteVendors.vendorKey],
      set: { usageCount: sql`${favoriteVendors.usageCount} + 1` },
    });
}
