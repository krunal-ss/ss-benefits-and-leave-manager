import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims } from "@/db/schema";
import type { CategoryKey } from "@/server/benefits";

// Approved/used vs reserved (both reduce available). Rejected/draft reduce nothing.
const APPROVED = new Set(["auto_approved", "approved", "reimbursed"]);
const PENDING = new Set(["pending_hr", "submitted"]);

export type CategoryBalance = {
  categoryId: string;
  key: CategoryKey;
  label: string;
  capPaise: number;
  approvedPaise: number;
  pendingPaise: number;
  availablePaise: number;
};

function keyOf(name: string): CategoryKey {
  return name.toLowerCase() === "learning" ? "learning" : "sports";
}

/** Per-category approved/pending/available for one user in one FY. */
export async function getCategoryBalances(userId: string, fy: string): Promise<CategoryBalance[]> {
  const db = getDb();
  const categories = await db.select().from(benefitCategories);
  const claims = await db
    .select()
    .from(benefitClaims)
    .where(and(eq(benefitClaims.userId, userId), eq(benefitClaims.fy, fy)));

  return categories.map((c) => {
    let approvedPaise = 0;
    let pendingPaise = 0;
    for (const claim of claims) {
      if (claim.categoryId !== c.id) continue;
      if (APPROVED.has(claim.status)) approvedPaise += claim.amountPaise;
      else if (PENDING.has(claim.status)) pendingPaise += claim.amountPaise;
    }
    return {
      categoryId: c.id,
      key: keyOf(c.name),
      label: c.name,
      capPaise: c.annualCapPaise,
      approvedPaise,
      pendingPaise,
      availablePaise: c.annualCapPaise - approvedPaise - pendingPaise,
    };
  });
}

export async function getCategoryBalanceByKey(
  userId: string,
  fy: string,
  key: CategoryKey,
): Promise<CategoryBalance | undefined> {
  return (await getCategoryBalances(userId, fy)).find((b) => b.key === key);
}
