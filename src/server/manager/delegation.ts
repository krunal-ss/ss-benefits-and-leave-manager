// KAN-225 — Manager Delegation resolution. A delegate acts WITH the delegating
// manager's authority; these helpers answer "who may this user currently act
// for?" for the queue, decision, and access checks. A delegation is in effect
// when status = 'active' AND today is within [startDate, endDate] AND its scope
// covers the domain ('both' covers everything). Nothing here mutates state.
import "server-only";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { approvalDelegations, users, type User } from "@/db/schema";
import { todayISO } from "@/lib/fy";

export type DelegationScope = (typeof approvalDelegations.scope.enumValues)[number];
export type DelegationStatus = (typeof approvalDelegations.status.enumValues)[number];

export const DELEGATION_SCOPE_LABELS: Record<DelegationScope, string> = {
  leave: "Leave & WFH",
  expense: "Expenses",
  both: "Leave & Expenses",
};

/** Only approvers have authority to hand off — an employee has nothing to delegate. */
export const CAN_DELEGATE_ROLES: User["role"][] = ["team_lead", "project_manager", "hr_head", "admin"];
export function canDelegate(role: User["role"]): boolean {
  return CAN_DELEGATE_ROLES.includes(role);
}

function scopeMatches(needed: "leave" | "expense") {
  return or(eq(approvalDelegations.scope, needed), eq(approvalDelegations.scope, "both"));
}

/** In-effect predicate shared by every "is this delegation live right now?" query. */
function liveOn(today: string) {
  return and(
    eq(approvalDelegations.status, "active"),
    lte(approvalDelegations.startDate, today),
    gte(approvalDelegations.endDate, today),
  );
}

export type Delegator = { managerId: string; managerName: string; managerRole: User["role"] };

/** Managers who have delegated LEAVE approvals to `delegateId` and whose window covers today. */
export async function activeLeaveDelegatorsFor(delegateId: string, today = todayISO()): Promise<Delegator[]> {
  const db = getDb();
  const rows = await db
    .select({ managerId: users.id, managerName: users.name, managerRole: users.role })
    .from(approvalDelegations)
    .innerJoin(users, eq(approvalDelegations.managerId, users.id))
    .where(and(eq(approvalDelegations.delegateId, delegateId), liveOn(today), scopeMatches("leave")));
  return rows;
}

/** Managers who have delegated EXPENSE approvals to `delegateId` and whose window covers today. */
export async function activeExpenseDelegatorsFor(delegateId: string, today = todayISO()): Promise<Delegator[]> {
  const db = getDb();
  const rows = await db
    .select({ managerId: users.id, managerName: users.name, managerRole: users.role })
    .from(approvalDelegations)
    .innerJoin(users, eq(approvalDelegations.managerId, users.id))
    .where(and(eq(approvalDelegations.delegateId, delegateId), liveOn(today), scopeMatches("expense")));
  return rows;
}

/** Is `delegateId` currently allowed to act on LEAVE approvals routed to `managerId`? */
export async function isActiveLeaveDelegate(delegateId: string, managerId: string, today = todayISO()): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: approvalDelegations.id })
    .from(approvalDelegations)
    .where(
      and(
        eq(approvalDelegations.delegateId, delegateId),
        eq(approvalDelegations.managerId, managerId),
        liveOn(today),
        scopeMatches("leave"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Does `delegateId` currently hold an EXPENSE delegation from anyone? (Expense approval is capability-, not report-, scoped.) */
export async function hasActiveExpenseDelegation(delegateId: string, today = todayISO()): Promise<boolean> {
  return (await activeExpenseDelegatorsFor(delegateId, today)).length > 0;
}

export type DelegationCoverage = { leave: Delegator[]; expense: Delegator[] };

/** Everything currently delegated TO this user — drives the dashboard "you're covering for X" banner + access. */
export async function coverageFor(delegateId: string, today = todayISO()): Promise<DelegationCoverage> {
  const [leave, expense] = await Promise.all([
    activeLeaveDelegatorsFor(delegateId, today),
    activeExpenseDelegatorsFor(delegateId, today),
  ]);
  return { leave, expense };
}

export type MyDelegation = {
  id: string;
  delegateId: string;
  delegateName: string;
  delegateEmail: string;
  scope: DelegationScope;
  startDate: string;
  endDate: string;
  status: DelegationStatus;
  /** Derived display state: an active row whose window hasn't started / has ended reads as upcoming/expired. */
  effective: "upcoming" | "active" | "expired" | "cancelled";
};

function effectiveState(status: DelegationStatus, startDate: string, endDate: string, today: string): MyDelegation["effective"] {
  if (status === "cancelled") return "cancelled";
  if (status === "expired" || endDate < today) return "expired";
  if (startDate > today) return "upcoming";
  return "active";
}

export type DelegateCandidate = { id: string; name: string; email: string; role: User["role"] };

/** Everyone the manager could pick as a delegate (all users except themselves). */
export async function listDelegateCandidates(meId: string): Promise<DelegateCandidate[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users);
  return rows.filter((u) => u.id !== meId).sort((a, b) => a.name.localeCompare(b.name));
}

/** Delegations this manager has created (for the settings screen), newest first. */
export async function listMyDelegations(managerId: string, today = todayISO()): Promise<MyDelegation[]> {
  const db = getDb();
  const delegate = alias(users, "delegate");
  const rows = await db
    .select({
      id: approvalDelegations.id,
      delegateId: approvalDelegations.delegateId,
      delegateName: delegate.name,
      delegateEmail: delegate.email,
      scope: approvalDelegations.scope,
      startDate: approvalDelegations.startDate,
      endDate: approvalDelegations.endDate,
      status: approvalDelegations.status,
      createdAt: approvalDelegations.createdAt,
    })
    .from(approvalDelegations)
    .innerJoin(delegate, eq(approvalDelegations.delegateId, delegate.id))
    .where(eq(approvalDelegations.managerId, managerId));

  return rows
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      delegateId: r.delegateId,
      delegateName: r.delegateName,
      delegateEmail: r.delegateEmail,
      scope: r.scope,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      effective: effectiveState(r.status, r.startDate, r.endDate, today),
    }));
}
