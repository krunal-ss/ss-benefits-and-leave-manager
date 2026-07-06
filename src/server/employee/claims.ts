import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims } from "@/db/schema";
import { buildPage, normalizePage, type PageParams, type Paginated } from "@/server/pagination";
import type { CategoryKey } from "@/server/benefits";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Pending HR",
  pending_hr: "Pending HR",
  auto_approved: "Auto-approved",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
};

export type ClaimCheck = { label: string; ok: boolean; detail: string };

export type MyClaim = {
  id: string;
  category: string; // "Uncategorized" for a draft with no category chosen yet
  amount: number; // rupees; 0 for an incomplete draft
  date: string | null; // ISO yyyy-mm-dd (expense date); null for an incomplete draft
  vendor: string | null;
  status: string; // raw enum value
  statusLabel: string;
  decisionReason: string | null;
  checks: ClaimCheck[];
  createdAt: string; // ISO timestamp
  /** Under HR review — deletable via the existing delete-claim flow. */
  canDelete: boolean;
  /** KAN-125 — deletable/editable via the draft-expense actions instead. */
  isDraft: boolean;
};

/** A page of the employee's benefit/expense claims, newest first (KAN-70). */
export async function listMyClaims(
  userId: string,
  params: PageParams = {},
): Promise<Paginated<MyClaim>> {
  const db = getDb();
  const np = normalizePage(params);
  const rows = await db
    .select({
      id: benefitClaims.id,
      amountPaise: benefitClaims.amountPaise,
      date: benefitClaims.expenseDate,
      vendor: benefitClaims.vendor,
      status: benefitClaims.status,
      decisionReason: benefitClaims.decisionReason,
      verificationResult: benefitClaims.verificationResult,
      category: benefitCategories.name,
      createdAt: benefitClaims.createdAt,
    })
    .from(benefitClaims)
    // left join — a draft may not have a category chosen yet (KAN-125)
    .leftJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(eq(benefitClaims.userId, userId))
    .orderBy(desc(benefitClaims.createdAt))
    .limit(np.limit + 1) // fetch one extra to detect hasMore
    .offset(np.offset);

  const mapped = rows.map((r) => ({
    id: r.id,
    category: r.category ?? "Uncategorized",
    amount: (r.amountPaise ?? 0) / 100,
    date: r.date,
    vendor: r.vendor,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? r.status,
    decisionReason: r.decisionReason,
    checks: (r.verificationResult?.checks ?? []).map((c) => ({
      label: c.label,
      ok: c.ok,
      detail: c.detail,
    })),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    canDelete: r.status === "pending_hr",
    isDraft: r.status === "draft",
  }));

  return buildPage(mapped, np);
}

function keyOf(name: string): CategoryKey {
  return name.toLowerCase() === "learning" ? "learning" : "sports";
}

export type DraftClaim = {
  id: string;
  category: CategoryKey | null;
  amountRupees: number | null;
  date: string | null;
  vendor: string | null;
  hasDocument: boolean;
};

/** A single draft, owned by `userId`, for the resume-editing flow (KAN-125). Null if not found/not a draft/not owned. */
export async function getDraftClaim(userId: string, draftId: string): Promise<DraftClaim | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: benefitClaims.id,
      status: benefitClaims.status,
      amountPaise: benefitClaims.amountPaise,
      date: benefitClaims.expenseDate,
      vendor: benefitClaims.vendor,
      documentUrl: benefitClaims.documentUrl,
      categoryName: benefitCategories.name,
    })
    .from(benefitClaims)
    .leftJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(and(eq(benefitClaims.id, draftId), eq(benefitClaims.userId, userId)))
    .limit(1);

  if (!row || row.status !== "draft") return null;

  return {
    id: row.id,
    category: row.categoryName ? keyOf(row.categoryName) : null,
    amountRupees: row.amountPaise ? row.amountPaise / 100 : null,
    date: row.date,
    vendor: row.vendor,
    hasDocument: !!row.documentUrl,
  };
}
