// KAN-185 — Quick Search across leave requests, expense claims, employees and
// policies. RBAC + ownership hard rule: an Employee sees only their own leave
// & claims; a Team Lead/Project Manager additionally sees their direct
// reports' (by the DATA reporting line — users.teamLeadId/projectManagerId,
// never hard-coded); HR Head/Admin sees everyone. Policies are org-wide
// reference content, not personal data, so they're never ownership-scoped.
import "server-only";
import { and, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { benefitCategories, benefitClaims, leaveRequests, leaveTypes, users, type User } from "@/db/schema";
import { getLeavePolicies } from "@/server/policy";

export type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  who: string;
  href: string;
  statusLabel?: string;
};

export type SearchResults = {
  leaves: SearchResult[];
  claims: SearchResult[];
  people: SearchResult[];
  policies: SearchResult[];
};

const EMPTY_RESULTS: SearchResults = { leaves: [], claims: [], people: [], policies: [] };
const RESULT_LIMIT = 8;

const LEAVE_STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  pending_l1: "Pending L1",
  pending_l2: "Pending L2",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  cancellation_requested: "Cancellation requested",
};
const CLAIM_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Pending HR",
  auto_approved: "Auto-approved",
  pending_hr: "Pending HR",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
};

/** "all" for HR Head/Admin, else the caller's own id plus their direct reports' ids. */
async function visibleUserIds(me: User): Promise<"all" | string[]> {
  if (me.role === "hr_head" || me.role === "admin") return "all";
  if (me.role === "team_lead" || me.role === "project_manager") {
    const db = getDb();
    const reports = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.teamLeadId, me.id), eq(users.projectManagerId, me.id)));
    return [me.id, ...reports.map((r) => r.id)];
  }
  return [me.id];
}

function scopeClause(column: AnyPgColumn, ids: "all" | string[]): SQL | undefined {
  return ids === "all" ? undefined : inArray(column, ids);
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Scoped, ranked, grouped search across all four entities. Empty query returns no results (no "browse everything" mode). */
export async function searchAll(me: User, query: string): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return EMPTY_RESULTS;

  const db = getDb();
  const ids = await visibleUserIds(me);
  const pattern = `%${q}%`;

  const leaveWhere = and(
    scopeClause(leaveRequests.userId, ids),
    or(ilike(leaveRequests.reason, pattern), ilike(leaveTypes.name, pattern)),
  );
  const leaveRows = await db
    .select({
      id: leaveRequests.id,
      typeName: leaveTypes.name,
      kind: leaveRequests.kind,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      status: leaveRequests.status,
      applicant: users.name,
    })
    .from(leaveRequests)
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .where(leaveWhere)
    .limit(RESULT_LIMIT);

  const leaves: SearchResult[] = leaveRows.map((r) => ({
    id: r.id,
    title: r.kind === "wfh" ? "Work from home" : (r.typeName ?? "Leave"),
    subtitle: r.fromDate === r.toDate ? r.fromDate : `${r.fromDate} – ${r.toDate}`,
    who: r.applicant,
    href: "/leave",
    statusLabel: LEAVE_STATUS_LABEL[r.status] ?? r.status,
  }));

  const claimWhere = and(
    scopeClause(benefitClaims.userId, ids),
    or(ilike(benefitClaims.vendor, pattern), ilike(benefitCategories.name, pattern)),
  );
  const claimRows = await db
    .select({
      id: benefitClaims.id,
      vendor: benefitClaims.vendor,
      category: benefitCategories.name,
      status: benefitClaims.status,
      applicant: users.name,
    })
    .from(benefitClaims)
    .leftJoin(benefitCategories, eq(benefitClaims.categoryId, benefitCategories.id))
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .where(claimWhere)
    .limit(RESULT_LIMIT);

  const claims: SearchResult[] = claimRows.map((r) => ({
    id: r.id,
    title: r.vendor?.trim() || "Expense claim",
    subtitle: r.category ?? "Uncategorized",
    who: r.applicant,
    href: "/submit",
    statusLabel: CLAIM_STATUS_LABEL[r.status] ?? r.status,
  }));

  const peopleWhere = and(
    scopeClause(users.id, ids),
    or(ilike(users.name, pattern), ilike(users.email, pattern), ilike(users.department, pattern)),
  );
  const peopleRows = await db
    .select({ id: users.id, name: users.name, email: users.email, department: users.department, role: users.role })
    .from(users)
    .where(peopleWhere)
    .limit(RESULT_LIMIT);

  const people: SearchResult[] = peopleRows.map((r) => ({
    id: r.id,
    title: r.name,
    subtitle: [r.department, r.email].filter(Boolean).join(" · "),
    who: initialsOf(r.name),
    href: "/dashboard",
  }));

  const allPolicies = await getLeavePolicies();
  const needle = q.toLowerCase();
  const policies: SearchResult[] = allPolicies
    .filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.summary.toLowerCase().includes(needle) ||
        p.faqs.some((f) => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle)),
    )
    .slice(0, RESULT_LIMIT)
    .map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.summary,
      who: "",
      href: `/leave-policy?policy=${p.id}`,
    }));

  return { leaves, claims, people, policies };
}
