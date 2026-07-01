import "server-only";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { getEnv } from "@/lib/env";
import { getDb } from "@/db";
import { auditLog, benefitClaims, type User } from "@/db/schema";
import { assertOwnership } from "@/server/auth/rbac";

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

// KAN-69: keep the signed-URL TTL short. A viewer only needs long enough to open
// the file once; a leaked URL then expires quickly. Do not raise without reason.
export const RECEIPT_URL_TTL_SEC = 60;

/**
 * Low-level signed-URL primitive (KAN-41). Never public.
 * INTERNAL — callers must go through `getReceiptUrlForClaim`, which enforces the
 * ownership/role check + audit entry (KAN-69). Do not export.
 */
async function createReceiptSignedUrl(
  path: string,
  expiresInSec: number = RECEIPT_URL_TTL_SEC,
): Promise<string | null> {
  if (!path) return null;
  const supabase = await storageClient();
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

export type ReceiptUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: "not_found" | "forbidden" | "no_document" | "unavailable" };

/**
 * KAN-69 (BE security): issue a short-lived receipt signed URL for a specific
 * claim, but ONLY after verifying the requester may view it. Employees may view
 * their own receipts; HR Head / Admin may view any (they decide the claims).
 * Every issued URL is recorded in the audit log (who viewed whose receipt, when).
 *
 * This is the single sanctioned way to obtain a receipt URL — the raw
 * `createReceiptSignedUrl` primitive is not exported, so ownership can never be
 * bypassed by a caller reaching straight for a path.
 */
export async function getReceiptUrlForClaim(
  requester: Pick<User, "id" | "role">,
  claimId: string,
): Promise<ReceiptUrlResult> {
  const db = getDb();
  const [claim] = await db
    .select({ userId: benefitClaims.userId, documentUrl: benefitClaims.documentUrl })
    .from(benefitClaims)
    .where(eq(benefitClaims.id, claimId))
    .limit(1);

  if (!claim) return { ok: false, reason: "not_found" };

  // Ownership + role gate: own claim, or a privileged reviewer (hr_head/admin).
  try {
    assertOwnership({
      role: requester.role,
      actorId: requester.id,
      resourceOwnerId: claim.userId,
    });
  } catch {
    return { ok: false, reason: "forbidden" };
  }

  if (!claim.documentUrl) return { ok: false, reason: "no_document" };

  const url = await createReceiptSignedUrl(claim.documentUrl);
  if (!url) return { ok: false, reason: "unavailable" };

  // Audit the disclosure — a signed URL is a grant of access to a private doc.
  await db
    .insert(auditLog)
    .values({
      actorId: requester.id,
      action: "view_receipt",
      entity: "benefit_claim",
      entityId: claimId,
      payload: { ownerId: claim.userId, ttlSec: RECEIPT_URL_TTL_SEC },
    })
    .catch(() => {}); // never fail the view because the audit insert hiccupped

  return { ok: true, url };
}
