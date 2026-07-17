// KAN-224 — Employee Document Vault reads. Lists a single employee's own
// documents (newest first) and derives an expiry status for the in-app reminder
// — the status is COMPUTED from expiryDate vs today, never stored.
import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employeeDocuments } from "@/db/schema";
import { todayISO } from "@/lib/fy";
import type { DocumentCategory } from "@/lib/document-categories";

/** How many days out counts as "expiring soon" for the reminder. */
export const EXPIRY_SOON_DAYS = 30;

export type ExpiryStatus = "none" | "valid" | "expiring" | "expired";

export type EmployeeDocumentItem = {
  id: string;
  category: DocumentCategory;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  expiryDate: string | null;
  expiryStatus: ExpiryStatus;
  daysUntilExpiry: number | null;
  createdAt: string;
};

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime();
  const to = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function expiryStatusFor(expiryDate: string | null, today: string): { status: ExpiryStatus; days: number | null } {
  if (!expiryDate) return { status: "none", days: null };
  const days = daysBetween(today, expiryDate);
  if (days < 0) return { status: "expired", days };
  if (days <= EXPIRY_SOON_DAYS) return { status: "expiring", days };
  return { status: "valid", days };
}

/** All of one user's documents, newest first. Own data only — caller passes their own id. */
export async function listEmployeeDocuments(userId: string): Promise<EmployeeDocumentItem[]> {
  const db = getDb();
  const today = todayISO();
  const rows = await db
    .select({
      id: employeeDocuments.id,
      category: employeeDocuments.category,
      fileName: employeeDocuments.fileName,
      contentType: employeeDocuments.contentType,
      sizeBytes: employeeDocuments.sizeBytes,
      expiryDate: employeeDocuments.expiryDate,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.userId, userId))
    .orderBy(desc(employeeDocuments.createdAt));

  return rows.map((r) => {
    const { status, days } = expiryStatusFor(r.expiryDate, today);
    return {
      id: r.id,
      category: r.category,
      fileName: r.fileName,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      expiryDate: r.expiryDate,
      expiryStatus: status,
      daysUntilExpiry: days,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
