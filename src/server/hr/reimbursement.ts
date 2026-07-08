import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims, users } from "@/db/schema";
import { currentFy } from "@/lib/fy";

// KAN-45 — FY-end reimbursement export. Aggregates the claims that are cleared for
// payout (system auto-approved + HR-approved) per employee for a given FY, so HR
// can export a payout file and then mark the batch Reimbursed. Money stays in
// integer paise end-to-end; rupee conversion happens only at display/CSV time.

// Statuses that are cleared for payout. "reimbursed" is intentionally excluded —
// those have already been paid out and must not appear in a new export.
export const PAYABLE_STATUSES = ["auto_approved", "approved"] as const;

export type ReimbursementLine = {
  claimId: string;
  category: string;
  amountPaise: number;
  expenseDate: string; // ISO yyyy-mm-dd
  status: (typeof PAYABLE_STATUSES)[number];
};

export type EmployeeReimbursement = {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  claimCount: number;
  totalPaise: number;
  claimIds: string[];
  lines: ReimbursementLine[];
};

export type ReimbursementBatch = {
  fy: string;
  generatedAt: string; // ISO timestamp
  employees: EmployeeReimbursement[];
  totalPaise: number;
  totalClaims: number;
};

type RawRow = {
  claimId: string;
  userId: string;
  name: string;
  email: string;
  department: string | null;
  category: string;
  amountPaise: number;
  expenseDate: string;
  status: (typeof PAYABLE_STATUSES)[number];
};

/**
 * Pure aggregation: fold flat payable claim rows into one entry per employee.
 * Kept separate from the DB read so it is unit-testable and the CSV builder can
 * reuse the same shape. Employees are sorted by name; lines by expense date.
 */
export function aggregateReimbursements(rows: RawRow[]): EmployeeReimbursement[] {
  const byUser = new Map<string, EmployeeReimbursement>();
  for (const r of rows) {
    let entry = byUser.get(r.userId);
    if (!entry) {
      entry = {
        userId: r.userId,
        name: r.name,
        email: r.email,
        department: r.department,
        claimCount: 0,
        totalPaise: 0,
        claimIds: [],
        lines: [],
      };
      byUser.set(r.userId, entry);
    }
    entry.claimCount += 1;
    entry.totalPaise += r.amountPaise;
    entry.claimIds.push(r.claimId);
    entry.lines.push({
      claimId: r.claimId,
      category: r.category,
      amountPaise: r.amountPaise,
      expenseDate: r.expenseDate,
      status: r.status,
    });
  }
  const employees = [...byUser.values()];
  for (const e of employees) {
    e.lines.sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  }
  employees.sort((a, b) => a.name.localeCompare(b.name));
  return employees;
}

/** Read every payable claim for `fy` and aggregate into a payout batch. */
export async function getReimbursementBatch(fy?: string): Promise<ReimbursementBatch> {
  const targetFy = fy ?? currentFy().label;
  const db = getDb();
  const rows = await db
    .select({
      claimId: benefitClaims.id,
      userId: benefitClaims.userId,
      name: users.name,
      email: users.email,
      department: users.department,
      category: benefitCategories.name,
      amountPaise: benefitClaims.amountPaise,
      expenseDate: benefitClaims.expenseDate,
      status: benefitClaims.status,
    })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(
      and(
        eq(benefitClaims.fy, targetFy),
        inArray(benefitClaims.status, [...PAYABLE_STATUSES]),
      ),
    );

  // guaranteed set — PAYABLE_STATUSES excludes draft, so amountPaise/expenseDate are non-null
  const employees = aggregateReimbursements(rows as RawRow[]);
  return {
    fy: targetFy,
    generatedAt: new Date().toISOString(),
    employees,
    totalPaise: employees.reduce((s, e) => s + e.totalPaise, 0),
    totalClaims: employees.reduce((s, e) => s + e.claimCount, 0),
  };
}

// ---- CSV export ----

/** Escape one CSV field per RFC 4180 (quote when it holds a comma, quote, or newline). */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  "Employee",
  "Email",
  "Department",
  "Claims",
  "Total (INR)",
  "Total (paise)",
  "FY",
] as const;

/**
 * Build a payout CSV from a batch — one row per employee. Amounts are rendered as
 * plain rupees (paise/100, two decimals) so a spreadsheet/bank import can parse
 * them; the integer-paise column is included for an exact audit value.
 * (No XLSX: this repo has no spreadsheet library in package.json — CSV only.)
 */
export function buildReimbursementCsv(batch: ReimbursementBatch): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(csvField).join(","));
  for (const e of batch.employees) {
    lines.push(
      [
        csvField(e.name),
        csvField(e.email),
        csvField(e.department ?? ""),
        csvField(e.claimCount),
        csvField((e.totalPaise / 100).toFixed(2)),
        csvField(e.totalPaise),
        csvField(batch.fy),
      ].join(","),
    );
  }
  // Trailing totals row for a quick reconcile.
  lines.push(
    [
      csvField("TOTAL"),
      "",
      "",
      csvField(batch.totalClaims),
      csvField((batch.totalPaise / 100).toFixed(2)),
      csvField(batch.totalPaise),
      csvField(batch.fy),
    ].join(","),
  );
  return lines.join("\r\n");
}
