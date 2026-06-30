"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, benefitClaims } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";

const schema = z.object({ claimId: z.string().uuid("Invalid claim.") });

export type DeleteClaimResult = { ok: boolean; error?: string };

/**
 * An employee may delete their own claim ONLY while it is under HR review
 * (`pending_hr`). Once auto-approved/approved/rejected/reimbursed it is final.
 */
export async function deleteClaimAction(input: z.input<typeof schema>): Promise<DeleteClaimResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  const db = getDb();

  // Ownership + state guard in one query — never trust the client.
  const [claim] = await db
    .select({
      id: benefitClaims.id,
      status: benefitClaims.status,
      amountPaise: benefitClaims.amountPaise,
      categoryId: benefitClaims.categoryId,
    })
    .from(benefitClaims)
    .where(and(eq(benefitClaims.id, parsed.data.claimId), eq(benefitClaims.userId, user.id)))
    .limit(1);

  if (!claim) return { ok: false, error: "Claim not found." };
  if (claim.status !== "pending_hr")
    return { ok: false, error: "Only a claim still under review can be deleted." };

  await db.delete(benefitClaims).where(eq(benefitClaims.id, claim.id));

  await db.insert(auditLog).values({
    actorId: user.id,
    action: "delete_expense",
    entity: "benefit_claim",
    entityId: claim.id,
    payload: { status: claim.status, amountPaise: claim.amountPaise, categoryId: claim.categoryId },
  });

  revalidatePath("/submit");
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  return { ok: true };
}
