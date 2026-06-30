"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, leaveRequests } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";

const PENDING_STATUSES = ["applied", "pending_l1", "pending_l2"];

const schema = z.object({ requestId: z.string().uuid("Invalid request.") });

export type CancelLeaveResult = { ok: boolean; error?: string };

/**
 * An employee may cancel their own leave/WFH request ONLY while it is still
 * pending a decision. We soft-cancel (status → "cancelled") to keep the trail.
 * A pending request hasn't deducted any balance yet, so nothing is restored —
 * but per house rules every state change still writes an AuditLog row.
 */
export async function cancelLeaveAction(input: z.input<typeof schema>): Promise<CancelLeaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  const db = getDb();

  const [req] = await db
    .select({ id: leaveRequests.id, status: leaveRequests.status, kind: leaveRequests.kind })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, parsed.data.requestId), eq(leaveRequests.userId, user.id)))
    .limit(1);

  if (!req) return { ok: false, error: "Request not found." };
  if (!PENDING_STATUSES.includes(req.status))
    return { ok: false, error: "Only a pending request can be cancelled." };

  await db
    .update(leaveRequests)
    .set({ status: "cancelled" })
    .where(eq(leaveRequests.id, req.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "cancel_leave",
    entity: "leave_request",
    entityId: req.id,
    payload: { previousStatus: req.status, kind: req.kind },
  });

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  revalidatePath("/approvals");
  return { ok: true };
}
