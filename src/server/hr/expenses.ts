import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import {
  auditLog,
  benefitCategories,
  benefitClaims,
  receiptVerifications,
  users,
  type AiScoreFactor,
  type FraudSignal,
  type OcrField,
  type User,
  type VerificationResult,
} from "@/db/schema";
import { currentFy } from "@/lib/fy";
import { formatINR } from "@/lib/format";
import { buildPage, normalizePage, type PageParams, type Paginated } from "@/server/pagination";
import { assertCan } from "@/server/auth/rbac";
import { getReceiptUrlForClaim } from "@/server/supabase/storage";
import type { AiVerdict } from "@/server/verification";
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

/** A page of claims awaiting HR Head review (failed auto-verification), newest first (KAN-70). */
export async function getHrExpenseQueue(params: PageParams = {}): Promise<Paginated<QueuedClaim>> {
  const db = getDb();
  const np = normalizePage(params);
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
    .orderBy(desc(benefitClaims.createdAt))
    .limit(np.limit + 1) // fetch one extra to detect hasMore
    .offset(np.offset);

  const mapped = rows.map((r) => {
    const result = r.verificationResult ?? null;
    const checks = (result?.checks ?? []).map((c) => ({ label: c.label, ok: c.ok, detail: c.detail }));
    const claimed = r.amountPaise! / 100; // guaranteed set — pending_hr excludes draft
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
      date: ex?.date?.trim() ? fmtDate(ex.date) : fmtDate(r.expenseDate!),
      confidence: confidenceLabel(result?.ocrConfidence),
      flags: flagsFor(result),
      checks,
    };
  });

  return buildPage(mapped, np);
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
      stats.reservedPaise += r.amountPaise!; // guaranteed set — pending_hr excludes draft
    } else if ((APPROVED_STATUSES as readonly string[]).includes(r.status)) {
      stats.approvedCount += 1;
      stats.approvedPaise += r.amountPaise!; // guaranteed set — approved statuses exclude draft
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

/** A page of already-decided claims (approved / auto-approved / rejected / reimbursed), newest first (KAN-70). */
export async function getDecidedClaims(params: PageParams = {}): Promise<Paginated<DecidedClaim>> {
  const db = getDb();
  const np = normalizePage(params);
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
    .orderBy(desc(benefitClaims.createdAt))
    .limit(np.limit + 1) // fetch one extra to detect hasMore
    .offset(np.offset);

  const mapped = rows.map((r) => ({
    id: r.id,
    ref: `BC-${r.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    name: r.name,
    dept: r.department ?? "—",
    initials: initialsOf(r.name),
    category: r.category,
    amount: r.amountPaise! / 100, // guaranteed set — decided statuses exclude draft
    date: fmtDate(r.expenseDate!),
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? "Approved",
    decidedBy: r.approverName ?? (r.status === "auto_approved" ? "System" : "—"),
    reason: r.decisionReason?.trim() || "—",
    vendor: r.vendor ?? "—",
  }));

  return buildPage(mapped, np);
}

// ---- KAN-112/117: Receipt Intelligence deep-dive ----

function shortRef(id: string): string {
  return `BC-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Automated pipeline steps are attributed to "System", not the submitting
// employee, so the audit trail doesn't misread an AI computation as something
// the employee did.
const SYSTEM_ACTIONS = new Set(["receipt_ai_verified"]);
const AUDIT_ACTION_LABEL: Record<string, string> = {
  submit_expense: "Claim submitted",
  receipt_ai_verified: "AI score computed",
  approved_expense: "Approved",
  rejected_expense: "Rejected",
  view_receipt: "Receipt viewed",
};

function auditDetail(action: string, payload: Record<string, unknown> | null): string {
  if (!payload) return "—";
  switch (action) {
    case "submit_expense":
      return `${payload.category ?? "—"} · ${formatINR(Number(payload.claimedPaise ?? 0) / 100)} · ${payload.hasDocument ? "with receipt" : "no receipt"}`;
    case "receipt_ai_verified":
      return `Score ${payload.aiScore}/100 — ${payload.verdict}`;
    case "approved_expense":
    case "rejected_expense":
      return typeof payload.reason === "string" && payload.reason.trim() ? payload.reason : `${formatINR(Number(payload.amountPaise ?? 0) / 100)}`;
    case "view_receipt":
      return "Signed URL issued (60s TTL)";
    default:
      return "—";
  }
}

function auditKind(action: string, payload: Record<string, unknown> | null): "neutral" | "warn" | "bad" {
  if (action === "rejected_expense") return "bad";
  if (action === "receipt_ai_verified") {
    const verdict = payload?.verdict;
    if (verdict === "reject") return "bad";
    if (verdict === "review") return "warn";
  }
  return "neutral";
}

export type ReceiptIntelligenceAuditEvent = {
  time: string;
  actor: string;
  action: string;
  detail: string;
  kind: "neutral" | "warn" | "bad";
};

export type ReceiptIntelligenceDuplicate = {
  ref: string;
  category: string;
  vendor: string;
  amount: number; // rupees
  date: string;
  statusLabel: ClaimStatus;
  similarityPercent: number;
  note: string;
};

export type ReceiptIntelligence = {
  id: string;
  ref: string;
  name: string;
  dept: string;
  initials: string;
  category: string;
  claimed: number; // rupees
  extracted: number; // rupees
  vendor: string;
  date: string;
  status: (typeof benefitClaims.$inferSelect)["status"];
  statusLabel: ClaimStatus;
  checks: { label: string; ok: boolean; detail: string }[];
  ocrConfidence: number; // 0..1
  ocrFields: OcrField[];
  aiScore: number;
  verdict: AiVerdict;
  verdictReason: string;
  factors: AiScoreFactor[];
  fraudSignals: FraudSignal[];
  duplicate: ReceiptIntelligenceDuplicate | null;
  audit: ReceiptIntelligenceAuditEvent[];
  receiptUrl: string | null;
  fileExt: string | null;
  canDecide: boolean;
};

/**
 * Full read for the HR-only "Receipt Intelligence" screen (KAN-112): the claim,
 * its stored rule checks + AI score/fraud signals (KAN-111), the resolved
 * duplicate match if any, the claim's audit trail, and a receipt preview URL.
 * Same capability gate as `decideExpenseAction` — this is a review surface,
 * not a public one.
 */
export async function getReceiptIntelligence(
  requester: Pick<User, "id" | "role">,
  claimId: string,
): Promise<ReceiptIntelligence | null> {
  assertCan(requester.role, "approveExpense");

  const db = getDb();
  const [row] = await db
    .select({
      id: benefitClaims.id,
      amountPaise: benefitClaims.amountPaise,
      expenseDate: benefitClaims.expenseDate,
      vendor: benefitClaims.vendor,
      documentUrl: benefitClaims.documentUrl,
      status: benefitClaims.status,
      verificationResult: benefitClaims.verificationResult,
      name: users.name,
      department: users.department,
      category: benefitCategories.name,
      aiScore: receiptVerifications.aiScore,
      verdict: receiptVerifications.verdict,
      verdictReason: receiptVerifications.verdictReason,
      factors: receiptVerifications.factors,
      fraudSignals: receiptVerifications.fraudSignals,
      duplicateMatch: receiptVerifications.duplicateMatch,
      ocrFields: receiptVerifications.ocrFields,
    })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .leftJoin(receiptVerifications, eq(receiptVerifications.claimId, benefitClaims.id))
    .where(eq(benefitClaims.id, claimId))
    .limit(1);

  if (!row) return null;

  const result = row.verificationResult;
  const claimed = (row.amountPaise ?? 0) / 100;
  const ex = result?.extracted;
  const extracted = ex && ex.amountPaise !== null ? ex.amountPaise / 100 : claimed;

  let duplicate: ReceiptIntelligenceDuplicate | null = null;
  const dup = row.duplicateMatch;
  if (dup) {
    const [matched] = await db
      .select({
        amountPaise: benefitClaims.amountPaise,
        expenseDate: benefitClaims.expenseDate,
        vendor: benefitClaims.vendor,
        status: benefitClaims.status,
        category: benefitCategories.name,
      })
      .from(benefitClaims)
      .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
      .where(eq(benefitClaims.id, dup.claimId))
      .limit(1);
    if (matched) {
      duplicate = {
        ref: shortRef(dup.claimId),
        category: matched.category,
        vendor: matched.vendor ?? "—",
        amount: (matched.amountPaise ?? 0) / 100,
        date: matched.expenseDate ? fmtDate(matched.expenseDate) : "—",
        statusLabel: STATUS_LABEL[matched.status] ?? "Approved",
        similarityPercent: dup.similarityPercent,
        note: dup.note,
      };
    }
  }

  const auditRows = await db
    .select({
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      payload: auditLog.payload,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(eq(auditLog.entityId, claimId))
    .orderBy(asc(auditLog.createdAt));

  const audit: ReceiptIntelligenceAuditEvent[] = auditRows.map((a) => ({
    time: fmtDateTime(a.createdAt),
    actor: SYSTEM_ACTIONS.has(a.action) ? "System" : (a.actorName ?? "—"),
    action: AUDIT_ACTION_LABEL[a.action] ?? a.action.replace(/_/g, " "),
    detail: auditDetail(a.action, a.payload),
    kind: auditKind(a.action, a.payload),
  }));

  // Issuing the signed URL is itself audited by getReceiptUrlForClaim (a fresh
  // "Receipt viewed" row lands on the *next* load of this page, not this one).
  const receipt = await getReceiptUrlForClaim(requester, claimId);

  return {
    id: row.id,
    ref: shortRef(row.id),
    name: row.name,
    dept: row.department ?? "—",
    initials: initialsOf(row.name),
    category: row.category,
    claimed,
    extracted,
    vendor: ex?.vendor?.trim() || row.vendor || "—",
    date: ex?.date?.trim() ? fmtDate(ex.date) : row.expenseDate ? fmtDate(row.expenseDate) : "—",
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] ?? "Approved",
    checks: result?.checks ?? [],
    ocrConfidence: result?.ocrConfidence ?? 0,
    ocrFields: row.ocrFields ?? [],
    aiScore: row.aiScore ?? 0,
    verdict: row.verdict ?? "review",
    verdictReason: row.verdictReason ?? "AI verification not available for this claim.",
    factors: row.factors ?? [],
    fraudSignals: row.fraudSignals ?? [],
    duplicate,
    audit,
    receiptUrl: receipt.ok ? receipt.url : null,
    fileExt: row.documentUrl?.split(".").pop()?.toLowerCase() ?? null,
    canDecide: row.status === "pending_hr",
  };
}
// ---- end KAN-112/117 ----
