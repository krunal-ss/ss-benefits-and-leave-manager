// KAN-207 — Favorite Expense Vendors. Suggestions shown on the submit form
// (pinned first, then most-used) and the usage-count increment hooked into
// claim finalize (see expense-pipeline.ts's verifyAndScoreClaim) — never on
// draft save (src/server/actions/draft-expense.ts's saveDraftAction never
// calls that pipeline).
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favoriteVendors } from "@/db/schema";

export type FavoriteVendor = { id: string; vendorName: string; usageCount: number; pinned: boolean };

const SUGGESTION_LIMIT = 8;

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

/** Bump (or create) this vendor's usage count for the user. Called once per finalized claim. */
export async function recordVendorUsage(userId: string, vendorName: string): Promise<void> {
  const name = vendorName.trim();
  if (!name) return;

  const db = getDb();
  const [existing] = await db
    .select({ id: favoriteVendors.id, usageCount: favoriteVendors.usageCount })
    .from(favoriteVendors)
    .where(and(eq(favoriteVendors.userId, userId), eq(favoriteVendors.vendorName, name)))
    .limit(1);

  if (existing) {
    await db
      .update(favoriteVendors)
      .set({ usageCount: existing.usageCount + 1 })
      .where(eq(favoriteVendors.id, existing.id));
  } else {
    await db.insert(favoriteVendors).values({ userId, vendorName: name, usageCount: 1 });
  }
}
