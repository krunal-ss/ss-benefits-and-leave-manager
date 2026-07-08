"use server";

// KAN-46 — Save the approval policy from the HR/Admin config screen. Enforces
// capability (configurePolicy) before any DB write; delegates persistence +
// audit to src/server/policy/settings.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { saveApprovalPolicy } from "@/server/policy/settings";
import { isValidEmail, normaliseCcEmails } from "@/server/policy/approval-policy";

const schema = z.object({
  routingMode: z.enum(["sequential", "parallel"]),
  wfhAutoApproveMaxDays: z.number().min(0).max(30),
  ccEmails: z.array(z.string()).max(20),
  requireLeaveCancellationApproval: z.boolean(),
});

export type SavePolicyResult = { ok: boolean; message: string };

export async function saveApprovalPolicyAction(
  input: z.input<typeof schema>,
): Promise<SavePolicyResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  try {
    assertCan(me.role, "configurePolicy");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  const ccEmails = normaliseCcEmails(parsed.data.ccEmails);
  const bad = ccEmails.find((e) => !isValidEmail(e));
  if (bad) return { ok: false, message: `"${bad}" is not a valid email address.` };

  await saveApprovalPolicy({
    actorId: me.id,
    routingMode: parsed.data.routingMode,
    wfhAutoApproveMaxDays: parsed.data.wfhAutoApproveMaxDays,
    ccEmails,
    requireLeaveCancellationApproval: parsed.data.requireLeaveCancellationApproval,
  });

  revalidatePath("/settings/approvals");
  return { ok: true, message: "Approval policy saved." };
}
