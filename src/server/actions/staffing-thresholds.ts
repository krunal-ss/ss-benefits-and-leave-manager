"use server";

// KAN-74 — Save a staffing threshold (org default or department override) from
// the HR/Admin config screen. Validates input, enforces the configurePolicy
// capability (hr_head/admin) before any DB write, then delegates persistence +
// audit to src/server/hr/staffing-thresholds.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { upsertThreshold } from "@/server/hr/staffing-thresholds";

const schema = z
  .object({
    id: z.string().uuid().optional(),
    scope: z.enum(["org", "department"]),
    scopeValue: z.string().trim().max(120).optional(),
    minAvailablePercent: z.number().min(0).max(100),
  })
  .refine((d) => d.scope === "org" || !!d.scopeValue, {
    message: "Department name is required for a department override.",
    path: ["scopeValue"],
  });

export type SaveThresholdResult = { ok: boolean; message: string };

export async function saveStaffingThresholdAction(
  input: z.input<typeof schema>,
): Promise<SaveThresholdResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  try {
    assertCan(me.role, "configurePolicy");
    const row = await upsertThreshold({
      id: parsed.data.id,
      scope: parsed.data.scope,
      scopeValue: parsed.data.scopeValue ?? null,
      minAvailablePercent: parsed.data.minAvailablePercent,
      actorId: me.id,
      actorRole: me.role,
    });

    revalidatePath("/settings/staffing-thresholds");
    return {
      ok: true,
      message:
        row.scope === "org"
          ? "Org-wide default threshold saved."
          : `Threshold saved for "${row.scopeValue}".`,
    };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }
}
