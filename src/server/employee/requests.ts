import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { leaveRequests, leaveTypes, users } from "@/db/schema";
import { buildPage, normalizePage, type PageParams, type Paginated } from "@/server/pagination";

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  pending_l1: "Pending L1",
  pending_l2: "Pending L2",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export type MyRequest = {
  id: string;
  kind: "leave" | "wfh";
  typeCode: string; // CL/SL/EL/LOP or WFH
  typeLabel: string; // human label
  from: string; // ISO yyyy-mm-dd
  to: string; // ISO yyyy-mm-dd
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: string; // raw enum value
  statusLabel: string;
  teamLeadName: string | null;
  projectManagerName: string | null;
  createdAt: string; // ISO timestamp
};

/** Active = still counts against the calendar (not rejected/cancelled). */
export function isActiveStatus(status: string): boolean {
  return status !== "rejected" && status !== "cancelled";
}

/** A page of the employee's leave/WFH requests, newest first (KAN-70). */
export async function listMyRequests(
  userId: string,
  params: PageParams = {},
): Promise<Paginated<MyRequest>> {
  const db = getDb();
  const np = normalizePage(params);
  const tl = alias(users, "team_lead");
  const pm = alias(users, "project_manager");

  const rows = await db
    .select({
      id: leaveRequests.id,
      kind: leaveRequests.kind,
      typeCode: leaveTypes.code,
      typeName: leaveTypes.name,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
      halfDay: leaveRequests.halfDay,
      days: leaveRequests.workingDays,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      teamLeadName: tl.name,
      projectManagerName: pm.name,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .leftJoin(tl, eq(leaveRequests.teamLeadId, tl.id))
    .leftJoin(pm, eq(leaveRequests.projectManagerId, pm.id))
    .where(eq(leaveRequests.userId, userId))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(np.limit + 1) // fetch one extra to detect hasMore
    .offset(np.offset);

  const mapped = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    typeCode: r.kind === "wfh" ? "WFH" : (r.typeCode ?? "—"),
    typeLabel: r.kind === "wfh" ? "Work from home" : (r.typeName ?? "Leave"),
    from: r.from,
    to: r.to,
    halfDay: r.halfDay,
    days: Number(r.days),
    reason: r.reason,
    status: r.status,
    statusLabel: STATUS_LABEL[r.status] ?? r.status,
    teamLeadName: r.teamLeadName,
    projectManagerName: r.projectManagerName,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  return buildPage(mapped, np);
}

/**
 * All active (not rejected/cancelled) date ranges for the employee — used for the
 * calendar overlap check on the apply form. Kept separate from the paginated list
 * so the overlap guard always sees every active request, not just the first page.
 */
export async function listActiveRequestRanges(
  userId: string,
): Promise<{ from: string; to: string }[]> {
  const db = getDb();
  return db
    .select({ from: leaveRequests.fromDate, to: leaveRequests.toDate })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        ne(leaveRequests.status, "rejected"),
        ne(leaveRequests.status, "cancelled"),
      ),
    );
}
