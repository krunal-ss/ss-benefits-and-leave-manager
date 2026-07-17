"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { approvals, auditLog, emailLog, leaveBalances, leaveRequests, leaveTypes, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { isActiveLeaveDelegate } from "@/server/manager/delegation"; // KAN-225
import { sendEmail } from "@/server/email";
import { isNotificationAllowed } from "@/server/notifications/preferences";
import { loadApprovalPolicy } from "@/server/policy/settings"; // KAN-46
import { checkStaffingWarnings, type StaffingWarning } from "@/server/manager/staffing-guard"; // KAN-77
import { currentFy } from "@/lib/fy";

const schema = z.object({
  requestId: z.string().uuid("Invalid request."),
  approve: z.boolean(),
  reason: z.string().optional(),
});

export type DecisionResult = {
  ok: boolean;
  message: string;
  /** KAN-77 — advisory only; never blocks the decision. Empty/omitted when nothing is flagged. */
  warnings?: StaffingWarning[];
};

/**
 * Team Lead (L1) or Project Manager (L2) decides a leave/WFH request.
 * Enforces capability + ownership (the applicant must report to this approver),
 * advances the request, writes an approval + audit row, deducts balance on final
 * approval of a balance-deducting leave, and best-effort notifies the applicant.
 */
export async function decideLeaveAction(input: z.input<typeof schema>): Promise<DecisionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { requestId, approve, reason } = parsed.data;

  const me = await requireUser();
  const db = getDb();

  const [row] = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      kind: leaveRequests.kind,
      status: leaveRequests.status,
      leaveTypeId: leaveRequests.leaveTypeId,
      workingDays: leaveRequests.workingDays,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      halfDay: leaveRequests.halfDay,
      teamLeadId: leaveRequests.teamLeadId,
      projectManagerId: leaveRequests.projectManagerId,
      applicantName: users.name,
      applicantEmail: users.email,
      // KAN-77 — the applicant's own reporting line/department/critical-role
      // flag, needed by the staffing guard ("team" = their real reports-to-TL
      // siblings, independent of which TL this particular request routed to).
      applicantTeamLeadId: users.teamLeadId,
      applicantDepartment: users.department,
      applicantIsCriticalRole: users.isCriticalRole,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .where(eq(leaveRequests.id, requestId))
    .limit(1);

  if (!row) return { ok: false, message: "Request not found." };

  // KAN-46 — routing depends on the active policy. In PARALLEL mode both the TL
  // and the PM see the request while it's pending_l1, and either one's single
  // approval finalises it. In SEQUENTIAL mode it's the original TL→PM cascade.
  const policy = await loadApprovalPolicy();
  const parallel = policy.routingMode === "parallel";

  // Which level is this approver acting at, and who is the routed approver for it?
  let level: 1 | 2;
  let routedApproverId: string | null;
  if (row.status === "pending_l1") {
    if (parallel && me.role === "project_manager") {
      // Parallel: the PM may act on the still-pending request directly.
      level = 2;
      routedApproverId = row.projectManagerId;
    } else {
      level = 1;
      routedApproverId = row.teamLeadId;
    }
  } else if (row.status === "pending_l2") {
    level = 2;
    routedApproverId = row.projectManagerId;
  } else {
    return { ok: false, message: "This request is no longer pending." };
  }

  // Authorization: act on your OWN routed request (needs the matching L1/L2
  // capability), OR as an active delegate of the routed approver (KAN-225). A
  // delegate acts WITH the delegator's authority — the delegator is the routed
  // approver, so the delegate's own role/capability isn't re-checked.
  let actingForId: string | null = null;
  if (routedApproverId && routedApproverId === me.id) {
    try {
      assertCan(me.role, level === 1 ? "approveLeaveL1" : "approveLeaveL2");
    } catch (err) {
      if (err instanceof ForbiddenError) return { ok: false, message: err.message };
      throw err;
    }
  } else if (routedApproverId && (await isActiveLeaveDelegate(me.id, routedApproverId))) {
    actingForId = routedApproverId;
  } else {
    return { ok: false, message: "Not your direct report." };
  }

  const decision = approve ? "approved" : "rejected";
  // In parallel mode a single approval finalises; sequential keeps the L1→L2 cascade.
  const advancesToL2 = approve && level === 1 && !parallel;
  const nextStatus = !approve ? "rejected" : advancesToL2 ? "pending_l2" : "approved";
  const finalApproval = approve && !advancesToL2;

  // KAN-77 — advisory-only threshold/critical-role check, surfaced to the
  // approver alongside the decision outcome. Only relevant when approving
  // (rejecting keeps the status quo); never blocks the decision either way.
  // The row already exists in `leaveRequests` with a non-terminal status, so
  // it's already reflected in the DB availability numbers — no simulation needed.
  const warnings = approve
    ? await checkStaffingWarnings({
        requesterId: row.userId,
        teamLeadId: row.applicantTeamLeadId,
        department: row.applicantDepartment,
        isCriticalRole: row.applicantIsCriticalRole,
        kind: row.kind,
        fromDate: row.fromDate,
        toDate: row.toDate,
        halfDay: row.halfDay,
        persisted: true,
      })
    : [];

  await db.transaction(async (tx) => {
    await tx.insert(approvals).values({ requestId, level, approverId: me.id, decision, reason: reason ?? null });

    await tx
      .update(leaveRequests)
      .set({ status: nextStatus, currentLevel: advancesToL2 ? 2 : level })
      .where(eq(leaveRequests.id, requestId));

    await tx.insert(auditLog).values({
      actorId: me.id,
      action: `${decision}_leave_l${level}`,
      entity: "leave_request",
      entityId: requestId,
      payload: { decision, level, kind: row.kind, onBehalfOf: actingForId },
    });

    // Hard rule: deduct balance only on final approval of a balance-deducting leave,
    // and never without an audit row.
    if (finalApproval && row.kind === "leave" && row.leaveTypeId) {
      const [lt] = await tx
        .select({ deducts: leaveTypes.deductsBalance, code: leaveTypes.code })
        .from(leaveTypes)
        .where(eq(leaveTypes.id, row.leaveTypeId))
        .limit(1);

      if (lt?.deducts) {
        const fy = currentFy().label;
        const [bal] = await tx
          .select({ id: leaveBalances.id, days: leaveBalances.balanceDays })
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.userId, row.userId),
              eq(leaveBalances.leaveTypeId, row.leaveTypeId),
              eq(leaveBalances.fy, fy),
            ),
          )
          .limit(1);

        if (bal) {
          const newDays = Number(bal.days) - Number(row.workingDays);
          await tx.update(leaveBalances).set({ balanceDays: String(newDays) }).where(eq(leaveBalances.id, bal.id));
          await tx.insert(auditLog).values({
            actorId: me.id,
            action: "deduct_leave_balance",
            entity: "leave_balance",
            entityId: bal.id,
            payload: { requestId, code: lt.code, days: Number(row.workingDays), newBalance: newDays },
          });
        }
      }
    }
  });

  const cc = policy.ccEmails; // KAN-46 — configurable CC recipients on notifications

  // Best-effort notification — always record the attempt in the email log.
  const subject = approve
    ? advancesToL2
      ? "Your leave request advanced to L2"
      : "Your leave request was approved"
    : "Your leave request was rejected";
  if (await isNotificationAllowed(row.userId, { channel: "email" })) {
    try {
      await sendEmail({
        to: row.applicantEmail,
        cc,
        subject,
        html: `<p>Hi ${row.applicantName},</p><p>${subject}${reason ? ` — ${reason}` : "."}</p>`,
      });
      await db.insert(emailLog).values({ toAddress: row.applicantEmail, subject, template: "leave_decision", status: "sent" });
    } catch {
      await db
        .insert(emailLog)
        .values({ toAddress: row.applicantEmail, subject, template: "leave_decision", status: "failed" })
        .catch(() => {});
    }
  }

  // Sequential only: when L1 approves, the request advances to the chosen Project
  // Manager — notify them (in parallel mode the PM was already notified at apply time).
  if (advancesToL2 && row.projectManagerId) {
    const [pm] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.projectManagerId))
      .limit(1);
    if (pm && (await isNotificationAllowed(row.projectManagerId, { channel: "email" }))) {
      const pmSubject = "A leave/WFH request awaits your approval (L2)";
      try {
        await sendEmail({
          to: pm.email,
          cc,
          subject: pmSubject,
          html: `<p>Hi ${pm.name},</p><p>${row.applicantName}'s request was approved at L1 and now awaits your L2 decision.</p>`,
        });
        await db.insert(emailLog).values({ toAddress: pm.email, subject: pmSubject, template: "leave_l2_request", status: "sent" });
      } catch {
        await db
          .insert(emailLog)
          .values({ toAddress: pm.email, subject: pmSubject, template: "leave_l2_request", status: "failed" })
          .catch(() => {});
      }
    }
  }

  for (const path of ["/approvals", "/calendar", "/dashboard", "/leave"]) revalidatePath(path);

  return {
    ok: approve,
    message: !approve
      ? "Request rejected — applicant notified"
      : advancesToL2
        ? "Approved at L1 — forwarded to Project Manager"
        : "Fully approved — calendar updated, applicant notified",
    warnings,
  };
}
