"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { approvals, auditLog, emailLog, leaveBalances, leaveRequests, leaveTypes, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { sendEmail } from "@/server/email";
import { currentFy } from "@/lib/fy";

const schema = z.object({
  requestId: z.string().uuid("Invalid request."),
  approve: z.boolean(),
  reason: z.string().optional(),
});

export type DecisionResult = { ok: boolean; message: string };

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
      teamLeadId: leaveRequests.teamLeadId,
      projectManagerId: leaveRequests.projectManagerId,
      applicantName: users.name,
      applicantEmail: users.email,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .where(eq(leaveRequests.id, requestId))
    .limit(1);

  if (!row) return { ok: false, message: "Request not found." };

  // Which level is this approver acting at — and may they?
  let level: 1 | 2;
  try {
    if (row.status === "pending_l1") {
      level = 1;
      assertCan(me.role, "approveLeaveL1");
      if (row.teamLeadId !== me.id) throw new ForbiddenError("Not your direct report.");
    } else if (row.status === "pending_l2") {
      level = 2;
      assertCan(me.role, "approveLeaveL2");
      if (row.projectManagerId !== me.id) throw new ForbiddenError("Not your direct report.");
    } else {
      return { ok: false, message: "This request is no longer pending." };
    }
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  const decision = approve ? "approved" : "rejected";
  const nextStatus = !approve ? "rejected" : level === 1 ? "pending_l2" : "approved";
  const finalApproval = approve && level === 2;

  await db.transaction(async (tx) => {
    await tx.insert(approvals).values({ requestId, level, approverId: me.id, decision, reason: reason ?? null });

    await tx
      .update(leaveRequests)
      .set({ status: nextStatus, currentLevel: approve && level === 1 ? 2 : level })
      .where(eq(leaveRequests.id, requestId));

    await tx.insert(auditLog).values({
      actorId: me.id,
      action: `${decision}_leave_l${level}`,
      entity: "leave_request",
      entityId: requestId,
      payload: { decision, level, kind: row.kind },
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

  // Best-effort notification — always record the attempt in the email log.
  const subject = approve
    ? level === 1
      ? "Your leave request advanced to L2"
      : "Your leave request was approved"
    : "Your leave request was rejected";
  try {
    await sendEmail({
      to: row.applicantEmail,
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

  // When L1 approves, the request advances to the chosen Project Manager — notify them.
  if (approve && level === 1 && row.projectManagerId) {
    const [pm] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.projectManagerId))
      .limit(1);
    if (pm) {
      const pmSubject = "A leave/WFH request awaits your approval (L2)";
      try {
        await sendEmail({
          to: pm.email,
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
      : level === 1
        ? "Approved at L1 — forwarded to Project Manager"
        : "Fully approved — calendar updated, applicant notified",
  };
}
