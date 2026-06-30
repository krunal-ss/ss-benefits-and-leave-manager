"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, emailLog, leaveBalances, leaveRequests, leaveTypes, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan } from "@/server/auth/rbac";
import { sendEmail } from "@/server/email";
import { splitAgainstBalance } from "@/server/leave/accrual";
import { workingDaysBetween } from "@/lib/working-days";
import { currentFy } from "@/lib/fy";

const schema = z.object({
  requestType: z.enum(["CL", "SL", "EL", "LOP", "WFH"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date."),
  halfDay: z.boolean(),
  reason: z.string().default(""),
  teamLeadId: z.string().uuid("Select a Team Lead."),
  projectManagerId: z.string().uuid("Select a Project Manager."),
});

export type LeaveResult = {
  ok: boolean;
  error?: string;
  workingDays?: number;
  /** Working days that exceeded the available balance and were flagged LOP (PRD §5.5 AC2). */
  lopDays?: number;
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
    payload: { kind, days, lopDays, requestType: parsed.data.requestType, teamLeadId, projectManagerId },
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
  return { ok: true, workingDays: days, lopDays };
}
