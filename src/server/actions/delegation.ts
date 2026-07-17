"use server";

// KAN-225 — Create / cancel an approval delegation. Only an approver may delegate
// (they must have authority to hand off); a delegation is always owned by its
// creating manager (managerId = me.id — no managerId input), and cancel is
// ownership-scoped to that manager. Every change is audited in-transaction.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { approvalDelegations, auditLog, delegationScopeEnum, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { canDelegate } from "@/server/manager/delegation";

export type ActionResult = { ok: boolean; message: string };

const DELEGATION_PATHS = ["/settings/delegation", "/dashboard", "/approvals", "/expenses"];

const createSchema = z
  .object({
    delegateId: z.string().uuid("Choose a delegate."),
    scope: z.enum(delegationScopeEnum.enumValues),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD."),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date can't be before the start date." });

export async function createDelegationAction(input: z.input<typeof createSchema>): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  const me = await requireUser();
  if (!canDelegate(me.role)) return { ok: false, message: "Only approvers can delegate approvals." };
  if (d.delegateId === me.id) return { ok: false, message: "You can't delegate to yourself." };

  const db = getDb();
  const [delegate] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, d.delegateId))
    .limit(1);
  if (!delegate) return { ok: false, message: "That delegate no longer exists." };

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(approvalDelegations)
      .values({
        managerId: me.id,
        delegateId: d.delegateId,
        scope: d.scope,
        startDate: d.startDate,
        endDate: d.endDate,
        status: "active",
      })
      .returning({ id: approvalDelegations.id });
    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "create_delegation",
      entity: "approval_delegation",
      entityId: created.id,
      payload: { delegateId: d.delegateId, scope: d.scope, startDate: d.startDate, endDate: d.endDate },
    });
  });

  for (const p of DELEGATION_PATHS) revalidatePath(p);
  return { ok: true, message: `Delegated to ${delegate.name}.` };
}

const cancelSchema = z.object({ id: z.string().uuid("Invalid delegation.") });

export async function cancelDelegationAction(input: z.input<typeof cancelSchema>): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  const db = getDb();
  // Ownership: only the delegating manager may cancel their own delegation.
  const [existing] = await db
    .select({ id: approvalDelegations.id, status: approvalDelegations.status })
    .from(approvalDelegations)
    .where(and(eq(approvalDelegations.id, parsed.data.id), eq(approvalDelegations.managerId, me.id)))
    .limit(1);
  if (!existing) return { ok: false, message: "Delegation not found." };
  if (existing.status !== "active") return { ok: false, message: "This delegation is no longer active." };

  await db.transaction(async (tx) => {
    await tx
      .update(approvalDelegations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(approvalDelegations.id, existing.id));
    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "cancel_delegation",
      entity: "approval_delegation",
      entityId: existing.id,
    });
  });

  for (const p of DELEGATION_PATHS) revalidatePath(p);
  return { ok: true, message: "Delegation cancelled." };
}
