import "server-only";
import { and, count, eq, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import {
  benefitCategories,
  benefitClaims,
  leaveRequests,
  leaveTypes,
  users,
} from "@/db/schema";
import { currentFy, fyBounds } from "@/lib/fy";

// HR reporting dashboard (KAN-44) — aggregate read-only analytics over live DB
// data. All money is integer paise (format via src/lib/format.ts). Queries push
// grouping/aggregation into Postgres (GROUP BY + count/sum) so the dashboard
// stays fast; we never pull whole tables into JS to total them.

/**
 * Resolve a report filter to a label + inclusive ISO date bounds. The default is
 * the current financial year (1 Apr – 31 Mar). A caller may pass an explicit FY
 * label ("2025-26") or a custom from/to range; an unknown FY falls back to the
 * current one. The returned `fyLabel` is set only for whole-FY filters (claims
 * carry a denormalised `fy` column we can match directly); custom ranges leave
 * it null and are filtered by expense/request date instead.
 */
export type ReportRange = { label: string; start: string; end: string; fyLabel: string | null };

export function resolveRange(params?: { fy?: string; from?: string; to?: string }): ReportRange {
  const from = params?.from;
  const to = params?.to;
  // A custom date range wins over an FY label.
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { label: `${from} → ${to}`, start: from, end: to, fyLabel: null };
  }
  // Derive bounds from an FY label like "2025-26" (or fall back to current FY).
  const requested = params?.fy;
  if (requested && /^\d{4}-\d{2}$/.test(requested)) {
    const startYear = Number(requested.slice(0, 4));
    const b = fyBounds(`${startYear}-04-01`);
    if (b.label === requested) return { ...b, fyLabel: b.label };
  }
  const cur = currentFy();
  return { ...cur, fyLabel: cur.label };
}

/** The last `n` financial years (newest first) for a filter dropdown/segment. */
export function recentFyLabels(n = 4): string[] {
  const startYear = Number(currentFy().label.slice(0, 4));
  return Array.from({ length: n }, (_, i) => {
    const sy = startYear - i;
    return `${sy}-${String((sy + 1) % 100).padStart(2, "0")}`;
  });
}

// A claim's status maps to one of three reporting buckets.
const APPROVED_STATUSES = ["auto_approved", "approved", "reimbursed"] as const;
const DECIDED_STATUSES = [...APPROVED_STATUSES, "rejected"] as const;

/** SQL predicate restricting benefit claims to the report range. */
function claimRangeWhere(range: ReportRange) {
  return range.fyLabel
    ? eq(benefitClaims.fy, range.fyLabel)
    : and(gte(benefitClaims.expenseDate, range.start), lte(benefitClaims.expenseDate, range.end));
}

export type CategorySpend = {
  category: string;
  approvedPaise: number;
  capPaise: number;
  claimCount: number;
};

/** Approved benefit spend grouped by category (+ the category's annual cap). */
export async function getBenefitSpendByCategory(range: ReportRange): Promise<CategorySpend[]> {
  const db = getDb();
  const rows = await db
    .select({
      category: benefitCategories.name,
      capPaise: benefitCategories.annualCapPaise,
      approvedPaise: sum(benefitClaims.amountPaise).mapWith(Number),
      claimCount: count(benefitClaims.id),
    })
    .from(benefitClaims)
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(
      and(
        claimRangeWhere(range),
        sql`${benefitClaims.status} in ('auto_approved','approved','reimbursed')`,
      ),
    )
    .groupBy(benefitCategories.name, benefitCategories.annualCapPaise)
    .orderBy(sql`3 desc`);

  return rows.map((r) => ({
    category: r.category,
    approvedPaise: r.approvedPaise ?? 0,
    capPaise: r.capPaise,
    claimCount: r.claimCount,
  }));
}

export type DeptSpend = { department: string; approvedPaise: number; claimCount: number };

/** Approved benefit spend grouped by the claimant's department. */
export async function getBenefitSpendByDepartment(range: ReportRange): Promise<DeptSpend[]> {
  const db = getDb();
  const dept = sql<string>`coalesce(${users.department}, 'Unassigned')`;
  const rows = await db
    .select({
      department: dept,
      approvedPaise: sum(benefitClaims.amountPaise).mapWith(Number),
      claimCount: count(benefitClaims.id),
    })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .where(
      and(
        claimRangeWhere(range),
        sql`${benefitClaims.status} in ('auto_approved','approved','reimbursed')`,
      ),
    )
    .groupBy(dept)
    .orderBy(sql`2 desc`);

  return rows.map((r) => ({
    department: r.department,
    approvedPaise: r.approvedPaise ?? 0,
    claimCount: r.claimCount,
  }));
}

export type ApprovalRates = {
  decided: number;
  approved: number;
  rejected: number;
  autoApproved: number;
  pending: number;
  approvalRate: number; // approved / decided, 0..1 (0 when nothing decided)
  autoApprovalRate: number; // autoApproved / decided
};

/** Expense approval outcomes for the range (one grouped pass over claim rows). */
export async function getExpenseApprovalRates(range: ReportRange): Promise<ApprovalRates> {
  const db = getDb();
  const rows = await db
    .select({ status: benefitClaims.status, c: count(benefitClaims.id) })
    .from(benefitClaims)
    .where(claimRangeWhere(range))
    .groupBy(benefitClaims.status);

  const byStatus = new Map<string, number>(rows.map((r) => [r.status, r.c]));
  const at = (s: string) => byStatus.get(s) ?? 0;
  const autoApproved = at("auto_approved");
  const approved = autoApproved + at("approved") + at("reimbursed");
  const rejected = at("rejected");
  const decided = approved + rejected;
  const pending = at("pending_hr") + at("submitted") + at("draft");
  return {
    decided,
    approved,
    rejected,
    autoApproved,
    pending,
    approvalRate: decided === 0 ? 0 : approved / decided,
    autoApprovalRate: decided === 0 ? 0 : autoApproved / decided,
  };
}

export type LeaveTypeBreakdown = { type: string; requests: number; days: number };

export type LeaveReport = {
  totalRequests: number;
  approved: number;
  rejected: number;
  pending: number;
  cancelled: number;
  wfhRequests: number;
  approvedDays: number; // working days on approved requests
  byType: LeaveTypeBreakdown[]; // approved leave days grouped by leave type
};

/** Leave & WFH report for the range, filtered by request start date. */
export async function getLeaveReport(range: ReportRange): Promise<LeaveReport> {
  const db = getDb();
  const inRange = and(
    gte(leaveRequests.fromDate, range.start),
    lte(leaveRequests.fromDate, range.end),
  );

  const [statusRows, byTypeRows] = await Promise.all([
    db
      .select({
        status: leaveRequests.status,
        kind: leaveRequests.kind,
        c: count(leaveRequests.id),
        days: sum(leaveRequests.workingDays).mapWith(Number),
      })
      .from(leaveRequests)
      .where(inRange)
      .groupBy(leaveRequests.status, leaveRequests.kind),
    db
      .select({
        type: leaveTypes.name,
        requests: count(leaveRequests.id),
        days: sum(leaveRequests.workingDays).mapWith(Number),
      })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
      // KAN-127 — a pending cancellation isn't final yet; still counts as approved days.
      .where(and(inRange, inArray(leaveRequests.status, ["approved", "cancellation_requested"])))
      .groupBy(leaveTypes.name)
      .orderBy(sql`3 desc`),
  ]);

  const report: LeaveReport = {
    totalRequests: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    cancelled: 0,
    wfhRequests: 0,
    approvedDays: 0,
    byType: byTypeRows.map((r) => ({ type: r.type, requests: r.requests, days: r.days ?? 0 })),
  };

  for (const r of statusRows) {
    report.totalRequests += r.c;
    if (r.kind === "wfh") report.wfhRequests += r.c;
    if (r.status === "approved") {
      report.approved += r.c;
      report.approvedDays += r.days ?? 0;
    } else if (r.status === "rejected") {
      report.rejected += r.c;
    } else if (r.status === "cancelled") {
      report.cancelled += r.c;
    } else {
      // applied / pending_l1 / pending_l2
      report.pending += r.c;
    }
  }
  return report;
}

export type PendingQueues = { expenseHr: number; leaveL1: number; leaveL2: number };

/** Live counts of work waiting in each approval queue (not range-scoped). */
export async function getPendingQueueCounts(): Promise<PendingQueues> {
  const db = getDb();
  const rows = await db
    .select({ status: leaveRequests.status, c: count(leaveRequests.id) })
    .from(leaveRequests)
    .where(sql`${leaveRequests.status} in ('pending_l1','pending_l2')`)
    .groupBy(leaveRequests.status);
  const leaveL1 = rows.find((r) => r.status === "pending_l1")?.c ?? 0;
  const leaveL2 = rows.find((r) => r.status === "pending_l2")?.c ?? 0;

  const [hr] = await db
    .select({ c: count(benefitClaims.id) })
    .from(benefitClaims)
    .where(eq(benefitClaims.status, "pending_hr"));

  return { expenseHr: hr?.c ?? 0, leaveL1, leaveL2 };
}

export type ReportData = {
  range: ReportRange;
  byCategory: CategorySpend[];
  byDepartment: DeptSpend[];
  approval: ApprovalRates;
  leave: LeaveReport;
  queues: PendingQueues;
  totalApprovedPaise: number;
};

/** Load every aggregate the reports dashboard needs in one fan-out. */
export async function getReportData(params?: { fy?: string; from?: string; to?: string }): Promise<ReportData> {
  const range = resolveRange(params);
  const [byCategory, byDepartment, approval, leave, queues] = await Promise.all([
    getBenefitSpendByCategory(range),
    getBenefitSpendByDepartment(range),
    getExpenseApprovalRates(range),
    getLeaveReport(range),
    getPendingQueueCounts(),
  ]);
  const totalApprovedPaise = byCategory.reduce((s, c) => s + c.approvedPaise, 0);
  return { range, byCategory, byDepartment, approval, leave, queues, totalApprovedPaise };
}

// Keep DECIDED_STATUSES referenced for clarity of intent (approved + rejected).
export const REPORT_DECIDED_STATUSES = DECIDED_STATUSES;
