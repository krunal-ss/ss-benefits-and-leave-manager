import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims } from "@/db/schema";
import type { CategoryKey } from "@/server/benefits";

// KAN-146 (Wallet Transaction History) — an employee's benefit-wallet ledger,
// entirely DERIVED from `benefitCategories`/`benefitClaims`, never a stored
// table (same "don't persist what can be computed" convention as a claim's
// version number). One synthesized "credit" row per category (the FY
// allocation) plus one row per non-draft claim, classified by the same
// APPROVED/PENDING status-sets `getCategoryBalances` uses so the ledger and
// the dashboard balances can never disagree on what counts as reserved vs used.
const APPROVED = new Set(["auto_approved", "approved", "reimbursed"]);
const PENDING = new Set(["pending_hr", "submitted"]);

export type LedgerEventType = "credit" | "debit" | "reserved" | "released";

/** A single ledger row, before the running balance has been computed. */
export type LedgerSourceEvent = {
  dateIso: string; // full ISO timestamp, or a bare "YYYY-MM-DD" for the allocation rows
  type: LedgerEventType;
  categoryKey: CategoryKey;
  categoryLabel: string;
  description: string;
  ref: string;
  amountPaise: number; // signed: positive for credit/released, negative for debit/reserved
  method: string;
  isClaim: boolean;
};

export type LedgerEvent = LedgerSourceEvent & {
  id: string;
  balancePaise: number; // running balance immediately after this event
};

function keyOf(name: string): CategoryKey {
  return name.toLowerCase() === "learning" ? "learning" : "sports";
}

function shortRef(id: string): string {
  return `BC-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function methodForApproved(status: string): string {
  if (status === "auto_approved") return "Auto-approved";
  if (status === "reimbursed") return "Reimbursed at FY-end";
  return "Approved by HR";
}

/**
 * Pure sort + running-balance computation, factored out from the DB query so
 * it's unit-testable in isolation (see ledger.test.ts). Events are sorted
 * chronologically ascending to compute the balance, then returned newest
 * first to match the design's display order. Sort keys are plain ISO date
 * strings — safe to compare lexicographically because every source uses the
 * same "YYYY-MM-DD[...]" prefix (a bare allocation date sorts before a
 * same-day timestamped claim event, which is the desired "allocation lands
 * first thing that day" ordering).
 */
export function computeLedger(events: LedgerSourceEvent[]): LedgerEvent[] {
  const sorted = [...events].sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
  let balance = 0;
  const withBalance: LedgerEvent[] = sorted.map((e) => {
    balance += e.amountPaise;
    return { ...e, id: e.ref, balancePaise: balance };
  });
  return withBalance.reverse();
}

/** The employee's own wallet ledger for one FY, newest first, with a running balance. */
export async function getWalletLedger(userId: string, fy: string): Promise<LedgerEvent[]> {
  const db = getDb();
  const categories = await db.select().from(benefitCategories);
  const claims = await db
    .select()
    .from(benefitClaims)
    .where(and(eq(benefitClaims.userId, userId), eq(benefitClaims.fy, fy)));

  // FY label is always "<startYear>-<endYearShort>" (see src/lib/fy.ts) — the
  // allocation lands on 1 Apr of the start year.
  const fyStart = `${fy.split("-")[0]}-04-01`;

  const source: LedgerSourceEvent[] = [];

  for (const c of categories) {
    const categoryKey = keyOf(c.name);
    source.push({
      dateIso: fyStart,
      type: "credit",
      categoryKey,
      categoryLabel: c.name,
      description: "Annual benefit allocation",
      ref: `ALLOC-${categoryKey.toUpperCase()}-${fy}`,
      amountPaise: c.annualCapPaise,
      method: "System · FY roll-over",
      isClaim: false,
    });
  }

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  for (const claim of claims) {
    if (claim.status === "draft") continue; // never reserves/uses balance — nothing to show

    const categoryName = (claim.categoryId && categoryById.get(claim.categoryId)) || "Uncategorized";
    const categoryKey = keyOf(categoryName);
    const ref = shortRef(claim.id);
    const dateIso = claim.createdAt instanceof Date ? claim.createdAt.toISOString() : String(claim.createdAt);
    const amountPaise = claim.amountPaise ?? 0; // guaranteed set — statuses below all exclude draft
    const description = claim.vendor?.trim() || categoryName;

    if (PENDING.has(claim.status)) {
      source.push({
        dateIso,
        type: "reserved",
        categoryKey,
        categoryLabel: categoryName,
        description,
        ref,
        amountPaise: -amountPaise,
        method: "Claim submitted · hold placed",
        isClaim: true,
      });
    } else if (APPROVED.has(claim.status)) {
      source.push({
        dateIso,
        type: "debit",
        categoryKey,
        categoryLabel: categoryName,
        description,
        ref,
        amountPaise: -amountPaise,
        method: methodForApproved(claim.status),
        isClaim: true,
      });
    } else if (claim.status === "rejected") {
      // No separate "decided at" timestamp exists on benefitClaims, so a
      // rejected claim can't be shown as a true reserve-then-release pair —
      // represent it as a single, net-zero informational row instead.
      source.push({
        dateIso,
        type: "released",
        categoryKey,
        categoryLabel: categoryName,
        description: "Hold released · claim rejected",
        ref,
        amountPaise: 0,
        method: "HR rejected · hold released",
        isClaim: true,
      });
    }
  }

  return computeLedger(source);
}
