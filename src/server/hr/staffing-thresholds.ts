// KAN-74 — Staffing threshold configuration (HR Head / Admin). One org-wide
// default row (scope="org") plus optional per-department overrides
// (scope="department", scopeValue=<department name>), consulted later in the
// Smart Team Availability & Capacity Planner epic to warn approvers when a
// leave/WFH request would drop a team below the configured "% available".
// server-only: never import this from a Client Component.
import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, staffingThreshold, type StaffingThreshold } from "@/db/schema";
import { assertCan, type AppRole } from "@/server/auth/rbac";

export type StaffingThresholdRow = StaffingThreshold;

export type StaffingThresholdList = {
  orgDefault: StaffingThresholdRow | null;
  departmentOverrides: StaffingThresholdRow[];
};

/** The org-wide default (if configured) plus every department override, sorted by name. */
export async function listThresholds(): Promise<StaffingThresholdList> {
  const db = getDb();
  const rows = await db.select().from(staffingThreshold);

  const orgDefault = rows.find((r) => r.scope === "org") ?? null;
  const departmentOverrides = rows
    .filter((r) => r.scope === "department")
    .sort((a, b) => (a.scopeValue ?? "").localeCompare(b.scopeValue ?? ""));

  return { orgDefault, departmentOverrides };
}

export type UpsertThresholdInput = {
  /** Present when editing an existing row; omitted to create a new one. */
  id?: string;
  scope: "org" | "department";
  /** Department name — required (and trimmed) when scope is "department"; ignored for "org". */
  scopeValue?: string | null;
  minAvailablePercent: number;
  actorId: string;
  actorRole: AppRole;
};

/**
 * Create or update a threshold row. HR-Head/Admin only — checked here in
 * addition to the calling Server Action (defense in depth). Every create/update
 * writes an `auditLog` row: thresholds later drive approval warnings, so they
 * are treated as consequential state per CLAUDE.md's audit-trail hard rule.
 */
export async function upsertThreshold(input: UpsertThresholdInput): Promise<StaffingThresholdRow> {
  assertCan(input.actorRole, "configurePolicy");

  const db = getDb();
  const scopeValue = input.scope === "department" ? (input.scopeValue?.trim() || null) : null;
  if (input.scope === "department" && !scopeValue) {
    throw new Error("A department override requires a department name.");
  }
  const minAvailablePercent = Math.min(100, Math.max(0, Math.round(input.minAvailablePercent)));

  return db.transaction(async (tx) => {
    // Resolve the row to update: by id when editing, otherwise by scope
    // (+ department name) so re-saving the org default or an existing
    // department's override updates it in place instead of duplicating it.
    let existing: StaffingThresholdRow | undefined;
    if (input.id) {
      [existing] = await tx
        .select()
        .from(staffingThreshold)
        .where(eq(staffingThreshold.id, input.id))
        .limit(1);
    } else if (input.scope === "org") {
      [existing] = await tx
        .select()
        .from(staffingThreshold)
        .where(eq(staffingThreshold.scope, "org"))
        .limit(1);
    } else {
      [existing] = await tx
        .select()
        .from(staffingThreshold)
        .where(and(eq(staffingThreshold.scope, "department"), eq(staffingThreshold.scopeValue, scopeValue!)))
        .limit(1);
    }

    const values = {
      scope: input.scope,
      scopeValue,
      minAvailablePercent,
      updatedAt: new Date(),
      updatedBy: input.actorId,
    };

    const [row] = existing
      ? await tx
          .update(staffingThreshold)
          .set(values)
          .where(eq(staffingThreshold.id, existing.id))
          .returning()
      : await tx.insert(staffingThreshold).values(values).returning();

    await tx.insert(auditLog).values({
      actorId: input.actorId,
      action: "staffing_threshold.upsert",
      entity: "staffing_threshold",
      entityId: row.id,
      payload: {
        scope: row.scope,
        scopeValue: row.scopeValue,
        minAvailablePercent: row.minAvailablePercent,
        previousMinAvailablePercent: existing?.minAvailablePercent ?? null,
      },
    });

    return row;
  });
}
