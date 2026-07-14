"use server";

// KAN-187 — Leave Policy Viewer. Content edits + PDF upload are HR Head/Admin
// only (assertCan "configurePolicy", same capability settings/approvals uses);
// the signed-URL fetch is available to any authenticated user since every
// role can view + download the policy.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import {
  getLeavePolicyDocumentUrl,
  replaceLeavePolicyDocument,
  updateLeavePolicyContent,
  type PolicyFaq,
} from "@/server/policy";
import { uploadPolicyDocument } from "@/server/supabase/storage";

export type SavePolicyContentResult = { ok: boolean; message: string };

const contentSchema = z.object({
  leaveTypeId: z.string().uuid(),
  summary: z.string().max(500),
  eligibility: z.array(z.string().min(1)).max(20),
  approver: z.string().max(200),
  notice: z.string().max(200),
  encash: z.string().max(200),
  carryHeadline: z.string().max(200),
  carryText: z.string().max(2000),
  process: z.array(z.string().min(1)).max(20),
  faqs: z.array(z.object({ q: z.string().min(1).max(300), a: z.string().min(1).max(2000) })).max(20),
});

export async function saveLeavePolicyContentAction(
  input: z.input<typeof contentSchema>,
): Promise<SavePolicyContentResult> {
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const me = await requireUser();
  try {
    assertCan(me.role, "configurePolicy");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  await updateLeavePolicyContent({ actorId: me.id, ...parsed.data });
  revalidatePath("/leave-policy");
  revalidatePath("/settings/leave-policy");
  return { ok: true, message: "Policy content saved." };
}

export type UploadPolicyDocumentResult = { ok: boolean; message: string };

export async function uploadLeavePolicyDocumentAction(formData: FormData): Promise<UploadPolicyDocumentResult> {
  const me = await requireUser();
  try {
    assertCan(me.role, "configurePolicy");
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a PDF file to upload." };
  }

  try {
    const path = await uploadPolicyDocument(file);
    await replaceLeavePolicyDocument({ actorId: me.id, path });
    revalidatePath("/leave-policy");
    revalidatePath("/settings/leave-policy");
    return { ok: true, message: "Policy document updated." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not upload the document." };
  }
}

export type FaqInput = PolicyFaq;

/** Fresh short-lived signed URL for the "Download PDF" button — fetched on click, never baked into the page. */
export async function getLeavePolicyDocumentUrlAction(): Promise<string | null> {
  await requireUser();
  return getLeavePolicyDocumentUrl();
}
