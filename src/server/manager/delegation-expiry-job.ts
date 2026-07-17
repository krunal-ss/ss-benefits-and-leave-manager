import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalDelegations, auditLog } from "@/db/schema";
import { todayISO } from "@/lib/fy";

// KAN-225 — daily sweep that flips `active` delegations whose window has ended to
// `expired`. Note the runtime already treats a past-window delegation as inactive
// (the `liveOn` predicate requires endDate >= today), so this is housekeeping to
// keep the stored status truthful for the settings UI — never the sole guard.
export async function runDelegationExpiryJob(): Promise<{ expired: number }> {
  const db = getDb();
  const today = todayISO();

  const expired = await db
    .update(approvalDelegations)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(approvalDelegations.status, "active"), lt(approvalDelegations.endDate, today)))
    .returning({ id: approvalDelegations.id });

  for (const row of expired) {
    // System action (no actor) — actorId is nullable and renders as "System".
    await db
      .insert(auditLog)
      .values({ actorId: null, action: "expire_delegation", entity: "approval_delegation", entityId: row.id })
      .catch(() => {});
  }

  return { expired: expired.length };
}
