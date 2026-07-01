"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, emailLog, leaveBalances, leaveRequests, leaveTypes, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { sendEmail } from "@/server/email";
import { splitAgainstBalance } from "@/server/leave/accrual";
import { loadApprovalPolicy } from "@/server/policy/settings"; // KAN-46
import { decideRouting } from "@/server/policy/approval-policy"; // KAN-46
import { workingDaysBetween } from "@/lib/working-days";
import { currentFy } from "@/lib/fy";

const schema = z.object({
  requestType: z.enum(["CL", "SL", "EL", "LOP", "WFH"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
  halfDay: z.boolean(),
  reason: z.string().trim().min(3, "Add a reason for your request."),
  teamLeadId: z.string().uuid("Select a Team Lead."),
  projectManagerId: z.string().uuid("Select a Project Manager."),
});

export type LeaveResult = {
  ok: boolean;
  error?: string;
  workingDays?: number;
  /** Working days that exceeded the available balance and were flagged LOP (PRD §5.5 AC2). */
  lopDays?: number;
  /** KAN-46 — set when the policy auto-approved a short WFH request (no approver step). */
  autoApproved?: boolean;
};

export async function applyLeaveAction(input: z.input<typeof schema>): Promise<LeaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  assertCan(user.role, "applyLeave");

  const { days } = workingDaysBetween(parsed.data.from, parsed.data.to, parsed.data.halfDay);
  if (days <= 0) return { ok: false, error: "Pick a valid date range first." };

  const kind = parsed.data.requestType === "WFH" ? "wfh" : "leave";
  const db = getDb();

  // Block double-booking: reject if the range overlaps an existing request that
  // still counts against the calendar (anything but rejected/cancelled).
  // Two ranges overlap iff existing.from <= new.to AND existing.to >= new.from.
  const clash = await db
    .select({ from: leaveRequests.fromDate, to: leaveRequests.toDate })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, user.id),
        notInArray(leaveRequests.status, ["rejected", "cancelled"]),
        lte(leaveRequests.fromDate, parsed.data.to),
        gte(leaveRequests.toDate, parsed.data.from),
      ),
    )
    .limit(1);
  if (clash.length > 0) {
    return { ok: false, error: "You already have a leave/WFH request on one of these dates." };
  }

  // Validate the chosen approvers actually hold the right roles — a request must
  // never be routed to an arbitrary user (the dropdown is convenience, not trust).
  const { teamLeadId, projectManagerId } = parsed.data;
  const approverRows = await db
    .select({ id: users.id, role: users.role, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, [teamLeadId, projectManagerId]));
  const teamLead = approverRows.find((u) => u.id === teamLeadId);
  const projectManager = approverRows.find((u) => u.id === projectManagerId);
  if (!teamLead || teamLead.role !== "team_lead") return { ok: false, error: "Pick a valid Team Lead." };
  if (!projectManager || projectManager.role !== "project_manager")
    return { ok: false, error: "Pick a valid Project Manager." };

  let leaveTypeId: string | null = null;
  let deductsBalance = false;
  if (kind === "leave") {
    const [lt] = await db
      .select({ id: leaveTypes.id, deducts: leaveTypes.deductsBalance })
      .from(leaveTypes)
      .where(eq(leaveTypes.code, parsed.data.requestType))
      .limit(1);
    if (!lt) return { ok: false, error: "Leave type not configured — seed the database." };
    leaveTypeId = lt.id;
    deductsBalance = lt.deducts;
  }

  // PRD §5.5 AC2 — validate requested working days against the REAL per-type
  // balance. Policy: do not hard-block; the over-balance portion is flagged as
  // LOP (unpaid). WFH and non-deducting types (e.g. LOP) carry no balance.
  let lopDays = 0;
  if (kind === "leave" && leaveTypeId && deductsBalance) {
    const fy = currentFy().label;
    const [bal] = await db
      .select({ days: leaveBalances.balanceDays })
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.userId, user.id),
          eq(leaveBalances.leaveTypeId, leaveTypeId),
          eq(leaveBalances.fy, fy),
        ),
      )
      .limit(1);
    const available = bal ? Number(bal.days) : 0;
    lopDays = splitAgainstBalance(days, available, true).lopDays;
  }

  // KAN-46 — consult the configurable approval policy for routing. Auto-approve
  // is WFH-only and never touches a balance, so it can safely skip approvers;
  // balance-deducting leave always routes to approvers (see decideRouting).
  const policy = await loadApprovalPolicy();
  const routing = decideRouting({ kind, deductsBalance, workingDays: days, policy });
  const autoApproved = routing.outcome === "auto_approved";

  const [req] = await db
    .insert(leaveRequests)
    .values({
      userId: user.id,
      kind,
      leaveTypeId,
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
      halfDay: parsed.data.halfDay,
      workingDays: String(days),
      reason: parsed.data.reason || null,
      status: autoApproved ? "approved" : "pending_l1",
      currentLevel: 1,
      teamLeadId,
      projectManagerId,
    })
    .returning({ id: leaveRequests.id });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: autoApproved ? "auto_approve_leave" : "apply_leave",
    entity: "leave_request",
    entityId: req.id,
    payload: {
      kind,
      days,
      lopDays,
      requestType: parsed.data.requestType,
      teamLeadId,
      projectManagerId,
      routingMode: policy.routingMode,
      ...(autoApproved ? { autoApproved: true, reason: routing.reason } : {}),
    },
  });

  const cc = policy.ccEmails; // KAN-46 — configurable CC recipients on notifications

  if (autoApproved) {
    // WFH auto-approved: no balance to deduct — just confirm to the applicant (CC'd).
    const subject = "Your WFH request was auto-approved";
    try {
      await sendEmail({
        to: user.email,
        cc,
        subject,
        html: `<p>Hi ${user.name},</p><p>Your WFH request (${days} working day(s), ${parsed.data.from} – ${parsed.data.to}) was automatically approved under the current policy.</p>`,
      });
      await db.insert(emailLog).values({ toAddress: user.email, subject, template: "leave_auto_approved", status: "sent" });
    } catch {
      await db
        .insert(emailLog)
        .values({ toAddress: user.email, subject, template: "leave_auto_approved", status: "failed" })
        .catch(() => {});
    }
    revalidatePath("/dashboard");
    revalidatePath("/leave");
    revalidatePath("/approvals");
    return { ok: true, workingDays: days, lopDays, autoApproved: true };
  }

  // Notify the chosen Team Lead that a request awaits their L1 decision (CC'd).
  const subject = "A leave/WFH request awaits your approval (L1)";
  try {
    await sendEmail({
      to: teamLead.email,
      cc,
      subject,
      html: `<p>Hi ${teamLead.name},</p><p>${user.name} submitted a ${parsed.data.requestType} request (${days} working day(s), ${parsed.data.from} – ${parsed.data.to}) for your approval.</p>`,
    });
    await db.insert(emailLog).values({ toAddress: teamLead.email, subject, template: "leave_l1_request", status: "sent" });
  } catch {
    await db
      .insert(emailLog)
      .values({ toAddress: teamLead.email, subject, template: "leave_l1_request", status: "failed" })
      .catch(() => {});
  }

  // KAN-46 — parallel routing: notify the Project Manager (L2) up-front too, so
  // both approvers see the request at once (either may act; see decideLeaveAction).
  if (policy.routingMode === "parallel") {
    const pmSubject = "A leave/WFH request awaits your approval (L2)";
    try {
      await sendEmail({
        to: projectManager.email,
        cc,
        subject: pmSubject,
        html: `<p>Hi ${projectManager.name},</p><p>${user.name} submitted a ${parsed.data.requestType} request (${days} working day(s), ${parsed.data.from} – ${parsed.data.to}) for your approval.</p>`,
      });
      await db.insert(emailLog).values({ toAddress: projectManager.email, subject: pmSubject, template: "leave_l2_request", status: "sent" });
    } catch {
      await db
        .insert(emailLog)
        .values({ toAddress: projectManager.email, subject: pmSubject, template: "leave_l2_request", status: "failed" })
        .catch(() => {});
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/leave");
  revalidatePath("/approvals");
  return { ok: true, workingDays: days, lopDays };
}
