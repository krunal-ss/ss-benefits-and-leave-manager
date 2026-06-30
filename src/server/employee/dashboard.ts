import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims, leaveBalances, leaveRequests, leaveTypes } from "@/db/schema";
import { getCategoryBalances } from "./balances";
import { expectedAccrued, policyFromRow } from "@/server/leave/accrual";
import { currentFy, todayISO } from "@/lib/fy";
import type { Category, ClaimStatus, RecentClaim } from "@/server/benefits";
import type { LeaveCard, UpcomingItem } from "@/server/leave";

const WFH_MONTHLY_QUOTA = 8;
const STATUS_LABEL: Record<string, ClaimStatus> = {
  auto_approved: "Auto-approved",
  approved: "Approved",
  reimbursed: "Reimbursed",
  rejected: "Rejected",
  pending_hr: "Pending HR",
  submitted: "Pending HR",
  draft: "Pending HR",
};
const LEAVE_CARD_LABEL: Record<string, string> = {
  CL: "Casual Leave",
  SL: "Sick Leave",
  EL: "Earned Leave",
  LOP: "Loss of Pay",
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtRange(from: string, to: string): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
}

export type DashboardData = {
  fyLabel: string;
  categories: Category[];
  leaveCards: LeaveCard[];
  recentClaims: RecentClaim[];
  upcoming: UpcomingItem[];
};

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const db = getDb();
  const fy = currentFy().label;
  const today = todayISO();
  const monthPrefix = today.slice(0, 7);

  const balances = await getCategoryBalances(userId, fy);
  const categories: Category[] = balances.map((b) => ({
    key: b.key,
    label: b.label,
    cap: b.capPaise / 100,
    approved: b.approvedPaise / 100,
    pending: b.pendingPaise / 100,
  }));

  // Leave balance cards (CL/SL/EL) + a computed WFH-this-month card.
  // We show accrued / used / available per type: `available` is the stored
  // balance; `accrued` is what the accrual engine says should have accrued by
  // now (opening + monthly accrual, capped); `used` is the difference.
  const balRows = await db
    .select({
      days: leaveBalances.balanceDays,
      code: leaveTypes.code,
      max: leaveTypes.maxBalanceDays,
      accrualPerMonthDays: leaveTypes.accrualPerMonthDays,
      openingBalanceDays: leaveTypes.openingBalanceDays,
      carryForward: leaveTypes.carryForward,
      deductsBalance: leaveTypes.deductsBalance,
    })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.fy, fy)));

  const leaveCards: LeaveCard[] = ["CL", "SL", "EL"].flatMap((code) => {
    const row = balRows.find((r) => r.code === code);
    if (!row) return [];
    const available = Number(row.days);
    const accrued = expectedAccrued(
      policyFromRow({
        openingBalanceDays: row.openingBalanceDays,
        accrualPerMonthDays: row.accrualPerMonthDays,
        maxBalanceDays: row.max,
        carryForward: row.carryForward,
        deductsBalance: row.deductsBalance,
      }),
      today,
    );
    const used = Math.max(0, Math.round((accrued - available) * 100) / 100);
    return [
      {
        label: LEAVE_CARD_LABEL[code] ?? code,
        value: String(available),
        unit: "days",
        sub: `${used} used · ${accrued} accrued`,
      },
    ];
  });

  const wfhRows = await db
    .select({ from: leaveRequests.fromDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.kind, "wfh")));
  const wfhUsed = wfhRows.filter((r) => r.status === "approved" && r.from.startsWith(monthPrefix)).length;
  leaveCards.push({
    label: "WFH this month",
    value: String(Math.max(0, WFH_MONTHLY_QUOTA - wfhUsed)),
    unit: "left",
    sub: `${wfhUsed} of ${WFH_MONTHLY_QUOTA} used`,
  });

  // Recent claims.
  const claimRows = await db
    .select({
      vendor: benefitClaims.vendor,
      category: benefitCategories.name,
      date: benefitClaims.expenseDate,
      amountPaise: benefitClaims.amountPaise,
      status: benefitClaims.status,
    })
    .from(benefitClaims)
    .innerJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .where(eq(benefitClaims.userId, userId))
    .orderBy(desc(benefitClaims.createdAt))
    .limit(5);

  const recentClaims: RecentClaim[] = claimRows.map((c) => ({
    vendor: c.vendor ?? "Expense claim",
    category: c.category,
    date: fmtDate(c.date),
    amount: c.amountPaise / 100,
    status: STATUS_LABEL[c.status] ?? "Pending HR",
  }));

  // Upcoming time off (pending or approved, not in the past).
  const requestRows = await db
    .select({
      kind: leaveRequests.kind,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
      days: leaveRequests.workingDays,
      status: leaveRequests.status,
      typeName: leaveTypes.name,
    })
    .from(leaveRequests)
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(eq(leaveRequests.userId, userId))
    .orderBy(leaveRequests.fromDate);

  const upcoming: UpcomingItem[] = requestRows
    .filter((r) => r.to >= today && r.status !== "rejected" && r.status !== "cancelled")
    .slice(0, 4)
    .map((r) => ({
      title: r.kind === "wfh" ? "Work from home" : (r.typeName ?? "Leave"),
      dates: `${fmtRange(r.from, r.to)} · ${Number(r.days)} day(s)`,
      status: r.status === "approved" ? "Approved" : r.status === "pending_l2" ? "Pending L2" : "Pending L1",
      dot: r.status === "approved" ? "emerald" : "amber",
    }));

  return { fyLabel: `FY ${fy} · Apr–Mar`, categories, leaveCards, recentClaims, upcoming };
}
