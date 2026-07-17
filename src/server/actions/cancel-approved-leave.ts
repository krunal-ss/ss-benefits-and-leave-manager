"use server";

// KAN-127 — cancelling an already-APPROVED leave/WFH request (distinct from
// cancel-leave.ts, which only handles the still-pending case). Whether this
// needs the approver's sign-off is a policy toggle (KAN-46 approval_policy,
// requireLeaveCancellationApproval) — never hardcoded.
import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, emailLog, leaveBalances, leaveRequests, leaveTypes, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { sendEmail } from "@/server/email";
import { isNotificationAllowed } from "@/server/notifications/preferences";
import { loadApprovalPolicy } from "@/server/policy/settings";
import { currentFy, todayISO } from "@/lib/fy";

type Db = ReturnType<typeof getDb>;

export type CancelResult = { ok: boolean; message: string };

type CancellableRow = {
  id: string;
  userId: string;
  kind: "leave" | "wfh";
  leaveTypeId: string | null;
  workingDays: string;
  applicantName: string;
  applicantEmail: string;
};

/** Restore the deducted balance (if any) and mark the request cancelled — always in one audited transaction (hard rule). */
async function finalizeCancellation(db: Db, row: CancellableRow, actorId: string, reason: string | undefined) {
  await db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: reason ?? null })
      .where(eq(leaveRequests.id, row.id));

    await tx.insert(auditLog).values({
      actorId,
      action: "cancel_approved_leave",
      entity: "leave_request",
      entityId: row.id,
      payload: { reason: reason ?? null },
    });

    if (row.kind === "leave" && row.leaveTypeId) {
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
          .where(and(eq(leaveBalances.userId, row.userId), eq(leaveBalances.leaveTypeId, row.leaveTypeId), eq(leaveBalances.fy, fy)))
          .limit(1);

        if (bal) {
          const newDays = Number(bal.days) + Number(row.workingDays);
          await tx.update(leaveBalances).set({ balanceDays: String(newDays) }).where(eq(leaveBalances.id, bal.id));
          await tx.insert(auditLog).values({
            actorId,
            action: "restore_leave_balance",
            entity: "leave_balance",
            entityId: bal.id,
            payload: { requestId: row.id, code: lt.code, days: Number(row.workingDays), newBalance: newDays },
          });
        }
      }
    }
  });
}

// KAN-168 — `recipientUserId` gates the send on that recipient's own
// notification preferences + quiet hours. A skipped send writes no emailLog row.
async function notify(recipientUserId: string, toAddress: string, subject: string, html: string, template: string) {
  if (!(await isNotificationAllowed(recipientUserId, { channel: "email" }))) return;
  try {
    await sendEmail({ to: toAddress, subject, html });
    await getDb().insert(emailLog).values({ toAddress, subject, template, status: "sent" });
  } catch {
    await getDb()
      .insert(emailLog)
      .values({ toAddress, subject, template, status: "failed" })
      .catch(() => {});
  }
}

const requestSchema = z.object({ requestId: z.string().uuid("Invalid request."), reason: z.string().trim().max(500).optional() });

/**
 * An employee requests cancellation of their own APPROVED, not-yet-started leave/WFH.
 * Immediate (policy off) or awaiting approver sign-off (policy on) — either way,
 * a balance restore only ever happens on final cancellation, audited.
 */
export async function requestLeaveCancellationAction(input: z.input<typeof requestSchema>): Promise<CancelResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  const db = getDb();

  const [row] = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      status: leaveRequests.status,
      kind: leaveRequests.kind,
      fromDate: leaveRequests.fromDate,
      workingDays: leaveRequests.workingDays,
      leaveTypeId: leaveRequests.leaveTypeId,
      teamLeadId: leaveRequests.teamLeadId,
      projectManagerId: leaveRequests.projectManagerId,
      applicantName: users.name,
      applicantEmail: users.email,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .where(and(eq(leaveRequests.id, parsed.data.requestId), eq(leaveRequests.userId, me.id)))
    .limit(1);

  if (!row) return { ok: false, message: "Request not found." };
  if (row.status !== "approved") return { ok: false, message: "Only an approved request can be cancelled this way." };
  if (row.fromDate <= todayISO()) {
    return { ok: false, message: "This leave has already started and can no longer be cancelled." };
  }

  const policy = await loadApprovalPolicy();
  const reason = parsed.data.reason;

  if (!policy.requireLeaveCancellationApproval) {
    await finalizeCancellation(db, row, me.id, reason);
    revalidatePath("/leave");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    revalidatePath("/availability");
    return { ok: true, message: "Cancelled — balance restored." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({ status: "cancellation_requested", cancellationReason: reason ?? null })
      .where(eq(leaveRequests.id, row.id));

    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "request_leave_cancellation",
      entity: "leave_request",
      entityId: row.id,
      payload: { reason: reason ?? null },
    });
  });

  const approverIds = [row.teamLeadId, row.projectManagerId].filter((id): id is string => !!id);
  if (approverIds.length > 0) {
    const approvers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(or(...approverIds.map((id) => eq(users.id, id))));
    const subject = `${row.applicantName} requested to cancel an approved leave`;
    for (const approver of approvers) {
      await notify(
        approver.id,
        approver.email,
        subject,
        `<p>Hi ${approver.name},</p><p>${row.applicantName} has requested to cancel their approved leave/WFH${reason ? ` — reason: ${reason}` : "."}. Please review and decide.</p>`,
        "leave_cancellation_requested",
      );
    }
  }

  revalidatePath("/leave");
  revalidatePath("/approvals");
  return { ok: true, message: "Cancellation requested — awaiting approver sign-off." };
}

const decideSchema = z.object({ requestId: z.string().uuid("Invalid request."), approve: z.boolean() });

/** The original Team Lead or Project Manager on the request decides a pending cancellation. */
export async function decideLeaveCancellationAction(input: z.input<typeof decideSchema>): Promise<CancelResult> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  const db = getDb();

  const [row] = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      status: leaveRequests.status,
      kind: leaveRequests.kind,
      leaveTypeId: leaveRequests.leaveTypeId,
      workingDays: leaveRequests.workingDays,
      teamLeadId: leaveRequests.teamLeadId,
      projectManagerId: leaveRequests.projectManagerId,
      cancellationReason: leaveRequests.cancellationReason,
      applicantName: users.name,
      applicantEmail: users.email,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .where(eq(leaveRequests.id, parsed.data.requestId))
    .limit(1);

  if (!row) return { ok: false, message: "Request not found." };
  if (row.status !== "cancellation_requested") return { ok: false, message: "No cancellation is pending for this request." };
  if (row.teamLeadId !== me.id && row.projectManagerId !== me.id) {
    return { ok: false, message: "Not your direct report." };
  }

  const reason = row.cancellationReason ?? undefined;

  if (parsed.data.approve) {
    await finalizeCancellation(db, row, me.id, reason);
    await notify(
      row.userId,
      row.applicantEmail,
      "Your leave cancellation was approved",
      `<p>Hi ${row.applicantName},</p><p>Your cancellation request was approved — your balance has been restored.</p>`,
      "leave_cancellation_decision",
    );
    revalidatePath("/leave");
    revalidatePath("/approvals");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    revalidatePath("/availability");
    return { ok: true, message: "Cancellation approved — balance restored, applicant notified." };
  }

  await db.transaction(async (tx) => {
    await tx.update(leaveRequests).set({ status: "approved" }).where(eq(leaveRequests.id, row.id));
    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "reject_leave_cancellation",
      entity: "leave_request",
      entityId: row.id,
      payload: {},
    });
  });
  await notify(
    row.userId,
    row.applicantEmail,
    "Your leave cancellation request was declined",
    `<p>Hi ${row.applicantName},</p><p>Your cancellation request was declined — your leave remains approved.</p>`,
    "leave_cancellation_decision",
  );

  revalidatePath("/leave");
  revalidatePath("/approvals");
  return { ok: true, message: "Cancellation declined — the leave stays approved, applicant notified." };
}
