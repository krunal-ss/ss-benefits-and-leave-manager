import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { getEnv } from "@/lib/env";

// Receipt uploads go to a PRIVATE bucket — never public. We serve them back only
// via short-lived signed URLs (KAN-41 / PRD §4.5). The DB stores the storage PATH
// (not a URL) plus a SHA-256 of the file bytes for the duplicate-claim check.

export const RECEIPTS_BUCKET = "receipts";

// PRD §4.5: accept PDF/JPG/PNG only, cap the size so a huge upload can't wedge OCR.
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ReceiptMediaType = (typeof ALLOWED_TYPES)[number];

export function isAllowedReceiptType(type: string): type is ReceiptMediaType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

const EXT_FOR_TYPE: Record<ReceiptMediaType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** SHA-256 of the raw file bytes, lowercase hex — the dedupe key (PRD §4.5 AC2). */
export async function hashFileBytes(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Storage writes must bypass RLS, so use the service-role client when configured.
// (Reads of a private object also need it, since the anon/cookie client can't sign
// URLs for objects it doesn't own under default RLS.) Falls back to the
// cookie-scoped server client when no service role key is present (e.g. local dev
// with permissive bucket policies).
async function storageClient() {
  const env = getEnv();
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createSupabaseServerClient();
}

export type StoredReceipt = {
  path: string; // object path inside the private bucket (persisted as documentUrl)
  hash: string; // SHA-256 of the bytes (persisted as documentHash)
  contentType: ReceiptMediaType;
};

/**
 * Validate, hash, and upload a receipt to the private bucket.
 * Returns the storage path + content hash; never a public URL.
 * Throws on an invalid type / oversize file / storage failure.
 */
export async function uploadReceipt(file: File, userId: string): Promise<StoredReceipt> {
  if (!isAllowedReceiptType(file.type)) {
    throw new Error("Unsupported file type — upload a PDF, JPG, or PNG.");
  }
  if (file.size <= 0) throw new Error("The uploaded file is empty.");
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error("File too large — receipts must be under 10 MB.");
  }

  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const hash = await hashFileBytes(buf);
  const ext = EXT_FOR_TYPE[file.type];
  // Path namespaced by user; hash makes it stable + deduped per user.
  const path = `${userId}/${hash}.${ext}`;

  const supabase = await storageClient();
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true, // same bytes → same path; re-upload is a no-op overwrite
  });
  if (error) throw new Error(`Could not store the receipt: ${error.message}`);

  return { path, hash, contentType: file.type };
}

/** Short-lived signed URL to view a stored receipt (KAN-41). Never public. */
export async function getReceiptSignedUrl(path: string, expiresInSec = 60): Promise<string | null> {
  if (!path) return null;
  const supabase = await storageClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}
