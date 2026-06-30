import "server-only";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { leaveRequests, leaveTypes, users, type User } from "@/db/schema";
import { todayISO } from "@/lib/fy";

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
 */
function approverScope(role: User["role"]) {
  if (role === "team_lead")
    return { level: 1 as const, column: leaveRequests.teamLeadId, status: "pending_l1" as const };
  if (role === "project_manager")
    return { level: 2 as const, column: leaveRequests.projectManagerId, status: "pending_l2" as const };
  return null;
}

/** Requests from this manager's reports awaiting their decision (L1 for TL, L2 for PM). */
export async function getApprovalQueue(user: User): Promise<ApprovalRequest[]> {
  const scope = approverScope(user.role);
  if (!scope) return [];

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
      reason: leaveRequests.reason,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(and(eq(scope.column, user.id), eq(leaveRequests.status, scope.status)))
    .orderBy(leaveRequests.fromDate);

  return rows.map((r) => ({
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
  }));
}

/** How many requests are awaiting this manager's decision (drives the sidebar badge). */
export async function getPendingApprovalCount(user: User): Promise<number> {
  return (await getApprovalQueue(user)).length;
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
        eq(leaveRequests.status, "approved"),
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

/** Today, formatted like "Monday, 29 Jun 2026" for the "Out today" panel header. */
export function getTodayLabel(): string {
  return new Date(`${todayISO()}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
