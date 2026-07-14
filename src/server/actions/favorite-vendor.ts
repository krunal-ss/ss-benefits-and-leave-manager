"use server";

// KAN-207 — pin/unpin one of the caller's own favorite vendors. Ownership is
// enforced by scoping the lookup to userId, mirroring draft-expense.ts's
// pattern for other own-data mutations.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { favoriteVendors } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";

const toggleVendorPinSchema = z.object({ vendorId: z.string().uuid(), pinned: z.boolean() });

export type ToggleVendorPinResult = { ok: boolean; error?: string };

export async function toggleVendorPinAction(
  input: z.input<typeof toggleVendorPinSchema>,
): Promise<ToggleVendorPinResult> {
  const parsed = toggleVendorPinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const user = await requireUser();
  const db = getDb();

  const [existing] = await db
    .select({ id: favoriteVendors.id })
    .from(favoriteVendors)
    .where(and(eq(favoriteVendors.id, parsed.data.vendorId), eq(favoriteVendors.userId, user.id)))
    .limit(1);
  if (!existing) return { ok: false, error: "Vendor not found." };

  await db.update(favoriteVendors).set({ pinned: parsed.data.pinned }).where(eq(favoriteVendors.id, existing.id));

  revalidatePath("/submit");
  return { ok: true };
}
