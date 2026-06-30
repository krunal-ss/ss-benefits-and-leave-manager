import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims } from "@/db/schema";

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
  category: string;
  amount: number; // rupees
  date: string; // ISO yyyy-mm-dd (expense date)
  vendor: string | null;
  status: string; // raw enum value
  statusLabel: string;
  decisionReason: string | null;
  checks: ClaimCheck[];
  createdAt: string; // ISO timestamp
  /** Under HR review — the only state an employee may delete. */
  canDelete: boolean;
};

/** Every benefit/expense claim the employee has filed, newest first. */
export async function listMyClaims(userId: string): Promise<MyClaim[]> {
  const db = getDb();
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
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(eq(benefitClaims.userId, userId))
    .orderBy(desc(benefitClaims.createdAt));

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    amount: r.amountPaise / 100,
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
  }));
}
