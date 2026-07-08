import "server-only";
// KAN-155: the scheduled job that finds every overdue pending leave/WFH
// request and expense claim org-wide (unlike getApprovalQueue/getHrExpenseQueue,
// which are scoped to one approver / one paginated page) and escalates each
// via ./overdue-escalation.ts. Triggered by the Vercel Cron route at
// src/app/api/cron/overdue-escalation/route.ts. Resilient to a single row's
// failure — one bad email shouldn't drop the rest of the run — same
// Promise.allSettled shape as capacity-snapshot-job.ts.
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { benefitClaims, leaveRequests, users } from "@/db/schema";
import { computeSla, EXPENSE_SLA_HOURS, LEAVE_SLA_HOURS } from "@/server/sla";
import { notifyOverdueExpenseClaim, notifyOverdueLeaveRequest } from "./overdue-escalation";

type EscalationItem = { kind: "leave" | "expense"; id: string };

export type OverdueEscalationJobResult = {
  date: string;
  succeeded: EscalationItem[];
  failed: (EscalationItem & { error: string })[];
};

export async function runOverdueEscalationJob(now: Date = new Date()): Promise<OverdueEscalationJobResult> {
  const db = getDb();
  const teamLead = alias(users, "team_lead");
  const projectManager = alias(users, "project_manager");

  const leaveRows = await db
    .select({
      id: leaveRequests.id,
      createdAt: leaveRequests.createdAt,
      status: leaveRequests.status,
      applicantName: users.name,
      teamLeadEmail: teamLead.email,
      projectManagerEmail: projectManager.email,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .leftJoin(teamLead, eq(leaveRequests.teamLeadId, teamLead.id))
    .leftJoin(projectManager, eq(leaveRequests.projectManagerId, projectManager.id))
    .where(inArray(leaveRequests.status, ["pending_l1", "pending_l2"]));

  const overdueLeaveRows = leaveRows
    .filter((r) => computeSla(r.createdAt, LEAVE_SLA_HOURS, now).state === "overdue")
    .map((r) => ({ ...r, status: r.status as "pending_l1" | "pending_l2" }));

  const expenseRows = await db
    .select({ id: benefitClaims.id, createdAt: benefitClaims.createdAt, applicantName: users.name })
    .from(benefitClaims)
    .innerJoin(users, eq(benefitClaims.userId, users.id))
    .where(eq(benefitClaims.status, "pending_hr"));

  const overdueExpenseRows = expenseRows.filter((r) => computeSla(r.createdAt, EXPENSE_SLA_HOURS, now).state === "overdue");

  const items: EscalationItem[] = [
    ...overdueLeaveRows.map((r) => ({ kind: "leave" as const, id: r.id })),
    ...overdueExpenseRows.map((r) => ({ kind: "expense" as const, id: r.id })),
  ];

  const results = await Promise.allSettled([
    ...overdueLeaveRows.map((r) => notifyOverdueLeaveRequest(r, now)),
    ...overdueExpenseRows.map((r) => notifyOverdueExpenseClaim(r, now)),
  ]);

  const succeeded: EscalationItem[] = [];
  const failed: OverdueEscalationJobResult["failed"] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") succeeded.push(items[i]);
    else failed.push({ ...items[i], error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });

  return { date: now.toISOString().slice(0, 10), succeeded, failed };
}
