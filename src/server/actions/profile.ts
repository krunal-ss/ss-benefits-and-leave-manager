"use server";

// KAN-223 — Self-service profile edit. This is the FIRST employee-owned profile
// edit path (previously only Admin could edit a user, via updateUserAction). It
// updates ONLY the caller's own row (me.id from requireUser — there is no userId
// input, so an employee can never edit anyone else's profile), and ONLY the
// employee-editable columns — role and reporting lines stay admin-only. Every
// change writes an AuditLog row inside the same transaction.
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";

export type ActionResult = { ok: boolean; message: string };

const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Full name is required.").max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === "" || /^[+0-9][0-9\s\-()]{5,}$/.test(v), "Enter a valid phone number.")
    .optional()
    .default(""),
  department: z.string().trim().max(120).optional().default(""),
  emergencyContact: z.string().trim().max(160).optional().default(""),
});

export async function updateMyProfileAction(
  input: z.input<typeof updateProfileSchema>,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  const db = getDb();
  const d = parsed.data;
  const next = {
    name: d.name.trim(),
    phone: d.phone.trim() || null,
    department: d.department.trim() || null,
    emergencyContact: d.emergencyContact.trim() || null,
  };

  await db.transaction(async (tx) => {
    await tx.update(users).set(next).where(eq(users.id, me.id));
    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "update_profile",
      entity: "user",
      entityId: me.id,
      payload: {
        before: {
          name: me.name,
          phone: me.phone,
          department: me.department,
          emergencyContact: me.emergencyContact,
        },
        after: next,
      },
    });
  });

  // Completion % is derived, so both the profile screen and the dashboard card
  // must re-read after an edit.
  for (const path of ["/profile", "/dashboard"]) revalidatePath(path);
  return { ok: true, message: "Profile updated." };
}
