"use server";

// KAN-224 — Employee Document Vault mutations. Every action is scoped to the
// caller's OWN documents (loads the row and checks `userId === me.id` before any
// write — ownership is enforced, not assumed) and audited in-transaction. Uploads
// go to the private `employee-docs` bucket; downloads are short-TTL signed URLs.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLog, documentCategoryEnum, employeeDocuments } from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import {
  getEmployeeDocumentUrl,
  removeEmployeeDocumentObject,
  uploadEmployeeDocument,
} from "@/server/supabase/storage";

export type ActionResult = { ok: boolean; message: string };

const DOCS_PATH = "/documents";

const categorySchema = z.enum(documentCategoryEnum.enumValues);
const expirySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date must be YYYY-MM-DD.")
  .optional()
  .or(z.literal(""));

function fileFrom(formData: FormData): File | null {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function addEmployeeDocumentAction(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  const file = fileFrom(formData);
  if (!file) return { ok: false, message: "Choose a PDF, JPG, or PNG file to upload." };

  const category = categorySchema.safeParse(formData.get("category"));
  if (!category.success) return { ok: false, message: "Choose a document category." };

  const expiryRaw = (formData.get("expiryDate") as string | null)?.trim() || "";
  const expiry = expirySchema.safeParse(expiryRaw);
  if (!expiry.success) return { ok: false, message: expiry.error.issues[0].message };

  try {
    const stored = await uploadEmployeeDocument(file, me.id);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(employeeDocuments)
        .values({
          userId: me.id,
          category: category.data,
          fileName: stored.fileName,
          storagePath: stored.path,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
          expiryDate: expiryRaw || null,
        })
        .returning({ id: employeeDocuments.id });
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: "add_document",
        entity: "employee_document",
        entityId: created.id,
        payload: { fileName: stored.fileName, category: category.data, expiryDate: expiryRaw || null },
      });
    });
    revalidatePath(DOCS_PATH);
    return { ok: true, message: "Document uploaded." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not upload the document." };
  }
}

export async function replaceEmployeeDocumentAction(formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  const documentId = z.string().uuid().safeParse(formData.get("documentId"));
  if (!documentId.success) return { ok: false, message: "Invalid document." };

  const file = fileFrom(formData);
  if (!file) return { ok: false, message: "Choose a replacement file." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(employeeDocuments)
    .where(and(eq(employeeDocuments.id, documentId.data), eq(employeeDocuments.userId, me.id)))
    .limit(1);
  if (!existing) return { ok: false, message: "Document not found." };

  try {
    const stored = await uploadEmployeeDocument(file, me.id);
    await db.transaction(async (tx) => {
      await tx
        .update(employeeDocuments)
        .set({
          fileName: stored.fileName,
          storagePath: stored.path,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
          updatedAt: new Date(),
        })
        .where(eq(employeeDocuments.id, existing.id));
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: "replace_document",
        entity: "employee_document",
        entityId: existing.id,
        payload: { from: existing.fileName, to: stored.fileName },
      });
    });
    // Remove the superseded object AFTER the row points at the new one.
    await removeEmployeeDocumentObject(existing.storagePath);
    revalidatePath(DOCS_PATH);
    return { ok: true, message: "Document replaced." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not replace the document." };
  }
}

export async function deleteEmployeeDocumentAction(input: { documentId: string }): Promise<ActionResult> {
  const me = await requireUser();
  const documentId = z.string().uuid().safeParse(input.documentId);
  if (!documentId.success) return { ok: false, message: "Invalid document." };

  const db = getDb();
  const [existing] = await db
    .select()
    .from(employeeDocuments)
    .where(and(eq(employeeDocuments.id, documentId.data), eq(employeeDocuments.userId, me.id)))
    .limit(1);
  if (!existing) return { ok: false, message: "Document not found." };

  await db.transaction(async (tx) => {
    await tx.delete(employeeDocuments).where(eq(employeeDocuments.id, existing.id));
    await tx.insert(auditLog).values({
      actorId: me.id,
      action: "delete_document",
      entity: "employee_document",
      entityId: existing.id,
      payload: { fileName: existing.fileName, category: existing.category },
    });
  });
  await removeEmployeeDocumentObject(existing.storagePath);
  revalidatePath(DOCS_PATH);
  return { ok: true, message: "Document deleted." };
}

/** Fresh short-lived signed URL for the "Download" button — fetched on click, never baked into the page. */
export async function getEmployeeDocumentUrlAction(documentId: string): Promise<string | null> {
  const me = await requireUser();
  const res = await getEmployeeDocumentUrl(me, documentId);
  return res.ok ? res.url : null;
}
