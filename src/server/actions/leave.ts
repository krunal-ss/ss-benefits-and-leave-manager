"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, emailLog, leaveRequests, leaveTypes, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { sendEmail } from "@/server/email";
import { workingDaysBetween } from "@/lib/working-days";

const schema = z.object({
  requestType: z.enum(["CL", "SL", "EL", "LOP", "WFH"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
  halfDay: z.boolean(),
  reason: z.string().trim().min(3, "Add a reason for your request."),
  teamLeadId: z.string().uuid("Select a Team Lead."),
  projectManagerId: z.string().uuid("Select a Project Manager."),
});

export type LeaveResult = { ok: boolean; error?: string; workingDays?: number };

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
  if (kind === "leave") {
    const [lt] = await db
      .select({ id: leaveTypes.id })
      .from(leaveTypes)
      .where(eq(leaveTypes.code, parsed.data.requestType))
      .limit(1);
    if (!lt) return { ok: false, error: "Leave type not configured — seed the database." };
    leaveTypeId = lt.id;
  }

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
      status: "pending_l1",
      currentLevel: 1,
      teamLeadId,
      projectManagerId,
    })
    .returning({ id: leaveRequests.id });

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "apply_leave",
    entity: "leave_request",
    entityId: req.id,
    payload: { kind, days, requestType: parsed.data.requestType, teamLeadId, projectManagerId },
  });

  // Best-effort: notify the chosen Team Lead that a request awaits their L1 decision.
  const subject = "A leave/WFH request awaits your approval (L1)";
  try {
    await sendEmail({
      to: teamLead.email,
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

  revalidatePath("/dashboard");
  revalidatePath("/leave");
  revalidatePath("/approvals");
  return { ok: true, workingDays: days };
}
