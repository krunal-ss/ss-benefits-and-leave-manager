import "server-only";
import { and, count, eq, gte, inArray, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { leaveRequests, leaveTypes, users, type User } from "@/db/schema";
import { loadApprovalPolicy } from "@/server/policy/settings"; // KAN-46
import { checkStaffingWarnings, type StaffingWarning } from "@/server/manager/staffing-guard"; // KAN-77
import { todayISO } from "@/lib/fy";
import { buildPage, normalizePage, type PageParams, type Paginated } from "@/server/pagination";

// Leave/WFH approval queue (manager view) + "out today" panel — real DB data,
// scoped to the signed-in manager's direct reports (reporting lines are DATA).

export type RequestKind = "leave" | "wfh";

export type ApprovalRequest = {
  id: string;
  name: string;
  initials: string;
  role: string; // human label (department) for the applicant
  type: string; // e.g. "Casual Leave" / "WFH"
  kind: RequestKind;
  dates: string;
  days: string;
  level: 1 | 2; // current pending level
  reason: string;
  /** KAN-77 — advisory only; empty when nothing is flagged for this request's date range. */
  warnings: StaffingWarning[];
};

export type OutTodayItem = {
  name: string;
  role: string;
  initials: string;
  type: string;
  kind: RequestKind;
};

const TYPE_LABEL: Record<string, string> = {
  CL: "Casual Leave",
  SL: "Sick Leave",
  EL: "Earned Leave",
  LOP: "Loss of Pay",
};

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
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function fmtRange(from: string, to: string): string {
  return from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
}
function fmtDays(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}
function typeLabel(kind: RequestKind, code: string | null): string {
  if (kind === "wfh") return "WFH";
  return (code && TYPE_LABEL[code]) || "Leave";
}

/**
 * The pending level + request-scope column for an approver role (null = not an approver).
 * Routing is per-request: a request carries the approvers its applicant chose, so we
 * match on leaveRequests.teamLeadId / projectManagerId rather than the user's reporting line.
 *
 * KAN-46 — in `parallel` mode both approvers see the request while it is pending_l1,
 * so the PM's queue matches pending_l1 (not pending_l2) too.
 */
function approverScope(role: User["role"], parallel = false) {
  if (role === "team_lead")
    return { level: 1 as const, column: leaveRequests.teamLeadId, status: "pending_l1" as const };
  if (role === "project_manager")
    return {
      level: 2 as const,
      column: leaveRequests.projectManagerId,
      status: parallel ? ("pending_l1" as const) : ("pending_l2" as const),
    };
  return null;
}

/** A page of requests from this manager's reports awaiting their decision (L1 for TL, L2 for PM). KAN-46 + KAN-70. */
export async function getApprovalQueue(
  user: User,
  params: PageParams = {},
): Promise<Paginated<ApprovalRequest>> {
  const policy = await loadApprovalPolicy(); // KAN-46 — routing mode affects PM queue scope
  const scope = approverScope(user.role, policy.routingMode === "parallel");
  const np = normalizePage(params);
  if (!scope) return buildPage<ApprovalRequest>([], np);

  const db = getDb();
  const rows = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      name: users.name,
      department: users.department,
      kind: leaveRequests.kind,
      code: leaveTypes.code,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
      halfDay: leaveRequests.halfDay,
      days: leaveRequests.workingDays,
      reason: leaveRequests.reason,
      // KAN-77 — the applicant's own reporting line/critical-role flag, used
      // to compute the staffing guard warnings for this row (see "team"
      // definition in staffing-guard.ts — the applicant's real reports-to-TL
      // siblings, independent of which TL this request happens to be routed to).
      applicantTeamLeadId: users.teamLeadId,
      applicantIsCriticalRole: users.isCriticalRole,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(and(eq(scope.column, user.id), eq(leaveRequests.status, scope.status)))
    .orderBy(leaveRequests.fromDate)
    .limit(np.limit + 1) // fetch one extra to detect hasMore
    .offset(np.offset);

  // Advisory-only warnings, computed per row so the approver sees them on the
  // queue itself (before they act), not just as a toast after deciding. The
  // request is already persisted (pending), so the guard reads current DB
  // availability directly — no simulation needed.
  const mapped = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      initials: initialsOf(r.name),
      role: r.department ?? "Team member",
      type: typeLabel(r.kind, r.code),
      kind: r.kind,
      dates: fmtRange(r.from, r.to),
      days: fmtDays(Number(r.days)),
      level: scope.level,
      reason: r.reason ?? "—",
      warnings: await checkStaffingWarnings({
        requesterId: r.userId,
        teamLeadId: r.applicantTeamLeadId,
        department: r.department,
        isCriticalRole: r.applicantIsCriticalRole,
        kind: r.kind,
        fromDate: r.from,
        toDate: r.to,
        halfDay: r.halfDay,
        persisted: true,
      }),
    })),
  );

  return buildPage(mapped, np);
}

/** How many requests are awaiting this manager's decision (drives the sidebar badge). */
export async function getPendingApprovalCount(user: User): Promise<number> {
  const scope = approverScope(user.role);
  if (!scope) return 0;
  const db = getDb();
  // COUNT query, not the paginated list — the badge must reflect the true total.
  const [row] = await db
    .select({ n: count() })
    .from(leaveRequests)
    .where(and(eq(scope.column, user.id), eq(leaveRequests.status, scope.status)));
  return row?.n ?? 0;
}

/** Reports of this manager who are on an approved leave/WFH that covers today. */
export async function getOutToday(user: User): Promise<OutTodayItem[]> {
  if (!approverScope(user.role)) return [];
  const db = getDb();
  const today = todayISO();

  const rows = await db
    .select({
      name: users.name,
      department: users.department,
      kind: leaveRequests.kind,
      code: leaveTypes.code,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        or(eq(leaveRequests.teamLeadId, user.id), eq(leaveRequests.projectManagerId, user.id)),
        // KAN-127 — a pending cancellation hasn't been finalized yet, so the
        // person is still out until it's actually approved.
        inArray(leaveRequests.status, ["approved", "cancellation_requested"]),
        lte(leaveRequests.fromDate, today),
        gte(leaveRequests.toDate, today),
      ),
    );

  return rows.map((r) => ({
    name: r.name,
    role: r.department ?? "Team member",
    initials: initialsOf(r.name),
    type: typeLabel(r.kind, r.code),
    kind: r.kind,
  }));
}

export type CancellationRequest = {
  id: string;
  name: string;
  initials: string;
  role: string;
  type: string;
  kind: RequestKind;
  dates: string;
  days: string;
  reason: string;
};

/** KAN-127 — approved requests whose applicant has asked to cancel, awaiting this manager's decision. */
export async function getPendingCancellations(user: User): Promise<CancellationRequest[]> {
  if (!approverScope(user.role)) return [];
  const db = getDb();

  const rows = await db
    .select({
      id: leaveRequests.id,
      name: users.name,
      department: users.department,
      kind: leaveRequests.kind,
      code: leaveTypes.code,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
      days: leaveRequests.workingDays,
      cancellationReason: leaveRequests.cancellationReason,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        or(eq(leaveRequests.teamLeadId, user.id), eq(leaveRequests.projectManagerId, user.id)),
        eq(leaveRequests.status, "cancellation_requested"),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    initials: initialsOf(r.name),
    role: r.department ?? "Team member",
    type: typeLabel(r.kind, r.code),
    kind: r.kind,
    dates: fmtRange(r.from, r.to),
    days: fmtDays(Number(r.days)),
    reason: r.cancellationReason?.trim() || "—",
  }));
}

/** Today, formatted like "Monday, 29 Jun 2026" for the "Out today" panel header. */
export function getTodayLabel(): string {
  return new Date(`${todayISO()}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
