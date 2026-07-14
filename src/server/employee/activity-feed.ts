import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims, leaveRequests, leaveTypes } from "@/db/schema";

// KAN-186 (Recent Activities Widget) — a DERIVED feed, never a stored table,
// same "don't persist what can be computed" convention as getWalletLedger
// (src/server/employee/ledger.ts, KAN-146). There's no separate "decided at"
// timestamp on leaveRequests/benefitClaims (see ledger.ts's note on rejected
// claims), so — like the ledger — each request/claim yields exactly ONE event
// reflecting its CURRENT status at its createdAt time, not a full status-change
// history. Wallet credit events reuse the same FY-allocation synthesis the
// ledger uses.

export type ActivityType = "leave" | "claim" | "wallet";
export type ActivityStatusKind = "approved" | "pending" | "rejected" | "info";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  status: ActivityStatusKind;
  statusLabel: string;
  iso: string; // full ISO timestamp (or "YYYY-MM-DD" for the FY-allocation rows)
};

const CLAIM_STATUS: Record<string, { status: ActivityStatusKind; label: string }> = {
  submitted: { status: "pending", label: "Pending HR" },
  pending_hr: { status: "pending", label: "Pending HR" },
  auto_approved: { status: "approved", label: "Auto-approved" },
  approved: { status: "approved", label: "Approved" },
  reimbursed: { status: "approved", label: "Reimbursed" },
  rejected: { status: "rejected", label: "Rejected" },
};

const LEAVE_STATUS: Record<string, { status: ActivityStatusKind; label: string }> = {
  applied: { status: "pending", label: "Applied" },
  pending_l1: { status: "pending", label: "Pending L1" },
  pending_l2: { status: "pending", label: "Pending L2" },
  approved: { status: "approved", label: "Approved" },
  rejected: { status: "rejected", label: "Rejected" },
  cancelled: { status: "info", label: "Cancelled" },
  cancellation_requested: { status: "pending", label: "Cancellation requested" },
};

/** The signed-in employee's own activity for one FY, newest first. Ownership is baked in via `userId`. */
export async function getRecentActivity(userId: string, fy: string): Promise<ActivityItem[]> {
  const db = getDb();
  const fyStart = `${fy.split("-")[0]}-04-01`;

  const claimRows = await db
    .select({
      id: benefitClaims.id,
      vendor: benefitClaims.vendor,
      category: benefitCategories.name,
      amountPaise: benefitClaims.amountPaise,
      status: benefitClaims.status,
      createdAt: benefitClaims.createdAt,
    })
    .from(benefitClaims)
    .leftJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    // Drafts are private working state, not activity (KAN-125), same exclusion as the dashboard/ledger.
    .where(and(eq(benefitClaims.userId, userId), ne(benefitClaims.status, "draft"), eq(benefitClaims.fy, fy)));

  const leaveRows = await db
    .select({
      id: leaveRequests.id,
      typeName: leaveTypes.name,
      kind: leaveRequests.kind,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      status: leaveRequests.status,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(eq(leaveRequests.userId, userId));

  const categories = await db.select().from(benefitCategories);

  const items: ActivityItem[] = [];

  for (const c of claimRows) {
    const meta = CLAIM_STATUS[c.status] ?? { status: "info" as const, label: c.status };
    const amount = c.amountPaise != null ? `₹${(c.amountPaise / 100).toLocaleString("en-IN")}` : "";
    items.push({
      id: `claim-${c.id}`,
      type: "claim",
      title: `${c.vendor?.trim() || "Expense claim"} claim`,
      detail: [meta.label, amount, c.category].filter(Boolean).join(" · "),
      status: meta.status,
      statusLabel: meta.label,
      iso: (c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)).toISOString(),
    });
  }

  for (const l of leaveRows) {
    const meta = LEAVE_STATUS[l.status] ?? { status: "info" as const, label: l.status };
    const title = l.kind === "wfh" ? "Work from home" : (l.typeName ?? "Leave");
    const dates = l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} – ${l.toDate}`;
    items.push({
      id: `leave-${l.id}`,
      type: "leave",
      title: `${title} applied · ${dates}`,
      detail: meta.label,
      status: meta.status,
      statusLabel: meta.label,
      iso: (l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt)).toISOString(),
    });
  }

  for (const cat of categories) {
    items.push({
      id: `wallet-${cat.id}-${fy}`,
      type: "wallet",
      title: `Wallet credited · ${cat.name} allocation`,
      detail: `₹${(cat.annualCapPaise / 100).toLocaleString("en-IN")} credited for FY ${fy}`,
      status: "info",
      statusLabel: "Info",
      iso: `${fyStart}T00:00:01.000Z`,
    });
  }

  return items.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
}
