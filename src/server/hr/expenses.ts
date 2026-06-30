import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims, users, type VerificationResult } from "@/db/schema";
import { currentFy } from "@/lib/fy";
import type { ClaimStatus } from "@/server/benefits";
import type { QueuedClaim } from "./queue-types";

// HR Head expense queue — real DB data. Claims that FAILED automated verification
// land in `pending_hr`; we surface the stored rule outcomes + derived flags so the
// human decision is fast and explainable. (Auto-approved claims never appear here.)

export type { QueuedClaim, RuleCheck } from "./queue-types";

// Map a failing rule check to the badge shown on the queue row. Order mirrors the
// rule engine in src/server/verification.ts.
const FLAG_FOR_CHECK: { match: string; flag: string }[] = [
  { match: "Amount matches", flag: "Amount mismatch" },
  { match: "Not a duplicate", flag: "Duplicate suspected" },
  { match: "Balance sufficient", flag: "Over balance" },
  { match: "File readable", flag: "No document" },
  { match: "OCR confidence", flag: "Low OCR" },
  { match: "Vendor", flag: "Vendor unclear" },
  { match: "Within current FY", flag: "Outside FY" },
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function confidenceLabel(conf: number | undefined): string {
  const pct = Math.round((conf ?? 0) * 100);
  const band = pct >= 85 ? "High" : pct >= 70 ? "Medium" : "Low";
  return `${band} (${pct}%)`;
}

function flagsFor(result: VerificationResult | null): string[] {
  if (!result) return [];
  const flags: string[] = [];
  for (const c of result.checks) {
    if (c.ok) continue;
    const mapped = FLAG_FOR_CHECK.find((f) => c.label.includes(f.match));
    if (mapped && !flags.includes(mapped.flag)) flags.push(mapped.flag);
  }
  return flags;
}

/** Claims awaiting HR Head review (failed auto-verification), newest first. */
export async function getHrExpenseQueue(): Promise<QueuedClaim[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: benefitClaims.id,
      amountPaise: benefitClaims.amountPaise,
      expenseDate: benefitClaims.expenseDate,
      vendor: benefitClaims.vendor,
      verificationResult: benefitClaims.verificationResult,
      name: users.name,
      department: users.department,
      category: benefitCategories.name,
    })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(eq(benefitClaims.status, "pending_hr"))
    .orderBy(desc(benefitClaims.createdAt));

  return rows.map((r) => {
    const result = r.verificationResult ?? null;
    const checks = (result?.checks ?? []).map((c) => ({ label: c.label, ok: c.ok, detail: c.detail }));
    const claimed = r.amountPaise / 100;
    // KAN-42: show what OCR actually read. Fall back to the claimed value when a
    // claim predates real OCR (no extracted block) so older rows still render.
    const ex = result?.extracted;
    const extracted = ex && ex.amountPaise !== null ? ex.amountPaise / 100 : claimed;
    const extractedVendor = ex?.vendor?.trim() || r.vendor || "—";
    return {
      id: r.id,
      ref: `BC-${r.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      name: r.name,
      dept: r.department ?? "—",
      initials: initialsOf(r.name),
      category: r.category,
      claimed,
      extracted,
      vendor: extractedVendor,
      date: ex?.date?.trim() ? fmtDate(ex.date) : fmtDate(r.expenseDate),
      confidence: confidenceLabel(result?.ocrConfidence),
      flags: flagsFor(result),
      checks,
    };
  });
}

export type HrExpenseStats = {
  pending: number;
  reservedPaise: number;
  approvedCount: number;
  approvedPaise: number;
  rejectedCount: number;
};

// Statuses that count as an "approved" outcome (system or HR or paid out).
const APPROVED_STATUSES = ["auto_approved", "approved", "reimbursed"] as const;

/** Headline counters for the queue page — FY-to-date, derived from live claim rows. */
export async function getHrExpenseStats(): Promise<HrExpenseStats> {
  const db = getDb();
  const fy = currentFy().label;

  const rows = await db
    .select({ status: benefitClaims.status, amountPaise: benefitClaims.amountPaise })
    .from(benefitClaims)
    .where(eq(benefitClaims.fy, fy));

  const stats: HrExpenseStats = { pending: 0, reservedPaise: 0, approvedCount: 0, approvedPaise: 0, rejectedCount: 0 };
  for (const r of rows) {
    if (r.status === "pending_hr") {
      stats.pending += 1;
      stats.reservedPaise += r.amountPaise;
    } else if ((APPROVED_STATUSES as readonly string[]).includes(r.status)) {
      stats.approvedCount += 1;
      stats.approvedPaise += r.amountPaise;
    } else if (r.status === "rejected") {
      stats.rejectedCount += 1;
    }
  }
  return stats;
}

export type DecidedClaim = {
  id: string;
  ref: string;
  name: string;
  dept: string;
  initials: string;
  category: string;
  amount: number; // rupees
  date: string; // expense date
  status: (typeof benefitClaims.$inferSelect)["status"];
  statusLabel: ClaimStatus;
  decidedBy: string; // approver name, or "System" for auto-approved
  reason: string; // decision note, or "—"
  vendor: string;
};

const STATUS_LABEL: Record<string, ClaimStatus> = {
  auto_approved: "Auto-approved",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
  pending_hr: "Pending HR",
};

/** Already-decided claims (approved / auto-approved / rejected / reimbursed), newest first. */
export async function getDecidedClaims(): Promise<DecidedClaim[]> {
  const db = getDb();
  const approver = alias(users, "approver");
  const rows = await db
    .select({
      id: benefitClaims.id,
      amountPaise: benefitClaims.amountPaise,
      expenseDate: benefitClaims.expenseDate,
      vendor: benefitClaims.vendor,
      status: benefitClaims.status,
      decisionReason: benefitClaims.decisionReason,
      name: users.name,
      department: users.department,
      category: benefitCategories.name,
      approverName: approver.name,
    })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .leftJoin(approver, eq(benefitClaims.approverId, approver.id))
    .where(inArray(benefitClaims.status, ["auto_approved", "approved", "rejected", "reimbursed"]))
    .orderBy(desc(benefitClaims.createdAt));

  return rows.map((r) => ({
    id: r.id,
    ref: `BC-${r.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    name: r.name,
    dept: r.department ?? "—",
    initials: initialsOf(r.name),
    category: r.category,
    amount: r.amountPaise / 100,
    date: fmtDate(r.expenseDate),
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? "Approved",
    decidedBy: r.approverName ?? (r.status === "auto_approved" ? "System" : "—"),
    reason: r.decisionReason?.trim() || "—",
    vendor: r.vendor ?? "—",
  }));
}
