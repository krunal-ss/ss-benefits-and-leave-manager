import "server-only";
import { and, count, eq, gte, inArray, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { leaveRequests, leaveTypes, users, type User } from "@/db/schema";
import { loadApprovalPolicy } from "@/server/policy/settings"; // KAN-46
import { checkStaffingWarnings, type StaffingWarning } from "@/server/manager/staffing-guard"; // KAN-77
import { activeLeaveDelegatorsFor } from "@/server/manager/delegation"; // KAN-225
import { todayISO } from "@/lib/fy";
import { buildPage, normalizePage, type PageParams, type Paginated } from "@/server/pagination";
import { computeSla, LEAVE_SLA_HOURS, summarizeSla } from "@/server/sla"; // KAN-147

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
  /** KAN-225 — set to the delegating manager's name when this row is visible via a delegation (not the viewer's own report). */
  onBehalfOf: string | null;
  /** KAN-77 — advisory only; empty when nothing is flagged for this request's date range. */
  warnings: StaffingWarning[];
  /** KAN-147 — ISO timestamp; the SLA clock's start. Raw, not pre-computed, so `<SlaBadge>` can tick it live client-side. */
  createdAt: string;
  /** KAN-155 — milliseconds since createdAt, computed at read time (not live-ticking). */
  elapsedMs: number;
  /** KAN-155 — true once the SLA target has passed; drives the overdue-escalation cron's row selection too. */
  isOverdue: boolean;
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

/**
 * A page of requests awaiting this user's decision — their own reports (L1 for TL,
 * L2 for PM) PLUS any routed to a manager who has delegated leave approvals to
 * them (KAN-225). Delegated rows carry `onBehalfOf` = the delegating manager's
 * name and are decided at that manager's level. KAN-46 + KAN-70.
 */
export async function getApprovalQueue(
  user: User,
  params: PageParams = {},
): Promise<Paginated<ApprovalRequest>> {
  const policy = await loadApprovalPolicy(); // KAN-46 — routing mode affects PM queue scope
  const parallel = policy.routingMode === "parallel";
  const np = normalizePage(params);

  // Approver "contexts": my own scope (if I'm an approver) + one per manager who
  // has delegated LEAVE approvals to me — I act at THAT manager's level.
  type Ctx = {
    approverId: string;
    col: "tl" | "pm";
    status: "pending_l1" | "pending_l2";
    level: 1 | 2;
    onBehalfOf: string | null;
  };
  const contexts: Ctx[] = [];
  const mine = approverScope(user.role, parallel);
  if (mine) contexts.push({ approverId: user.id, col: mine.level === 1 ? "tl" : "pm", status: mine.status, level: mine.level, onBehalfOf: null });
  for (const d of await activeLeaveDelegatorsFor(user.id)) {
    const s = approverScope(d.managerRole, parallel);
    if (s) contexts.push({ approverId: d.managerId, col: s.level === 1 ? "tl" : "pm", status: s.status, level: s.level, onBehalfOf: d.managerName });
  }
  if (contexts.length === 0) return buildPage<ApprovalRequest>([], np);

  const columnFor = (col: "tl" | "pm") => (col === "tl" ? leaveRequests.teamLeadId : leaveRequests.projectManagerId);

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
      createdAt: leaveRequests.createdAt, // KAN-147 — SLA clock start
      status: leaveRequests.status,
      teamLeadId: leaveRequests.teamLeadId,
      projectManagerId: leaveRequests.projectManagerId,
      // KAN-77 — the applicant's own reporting line/critical-role flag, used to
      // compute the staffing guard warnings for this row.
      applicantTeamLeadId: users.teamLeadId,
      applicantIsCriticalRole: users.isCriticalRole,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(or(...contexts.map((c) => and(eq(columnFor(c.col), c.approverId), eq(leaveRequests.status, c.status)))))
    .orderBy(leaveRequests.fromDate)
    .limit(np.limit + 1) // fetch one extra to detect hasMore — bounds the per-row warning work to one page
    .offset(np.offset);

  // Exactly one context matches a given row (approver ids are distinct; no self-delegation).
  const matchCtx = (r: (typeof rows)[number]): Ctx =>
    contexts.find((c) => (c.col === "tl" ? r.teamLeadId : r.projectManagerId) === c.approverId && r.status === c.status) ??
    contexts[0];

  const mapped = await Promise.all(
    rows.map(async (r) => {
      const ctx = matchCtx(r);
      return {
        id: r.id,
        name: r.name,
        initials: initialsOf(r.name),
        role: r.department ?? "Team member",
        type: typeLabel(r.kind, r.code),
        kind: r.kind,
        dates: fmtRange(r.from, r.to),
        days: fmtDays(Number(r.days)),
        level: ctx.level,
        reason: r.reason ?? "—",
        onBehalfOf: ctx.onBehalfOf,
        createdAt: r.createdAt.toISOString(),
        elapsedMs: Date.now() - r.createdAt.getTime(),
        isOverdue: computeSla(r.createdAt, LEAVE_SLA_HOURS).state === "overdue",
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
      };
    }),
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

/**
 * KAN-147 — on-track/due-soon/overdue counts across ALL of this manager's
 * pending requests (not just the current page), for the "SLA status" summary
 * bar above the approvals list. Mirrors `getPendingApprovalCount`'s shape: a
 * small aggregate query rather than fetching full paginated pages just to count.
 */
export async function getApprovalSlaSummary(user: User): Promise<{ ok: number; soon: number; over: number }> {
  const scope = approverScope(user.role);
  if (!scope) return { ok: 0, soon: 0, over: 0 };
  const db = getDb();
  const rows = await db
    .select({ createdAt: leaveRequests.createdAt })
    .from(leaveRequests)
    .where(and(eq(scope.column, user.id), eq(leaveRequests.status, scope.status)));
  return summarizeSla(rows.map((r) => r.createdAt), LEAVE_SLA_HOURS);
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
