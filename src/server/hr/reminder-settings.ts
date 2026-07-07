// KAN-148 — Remaining Benefit Reminder configuration (HR Head / Admin). One
// single settings row (mirrors src/server/policy/settings.ts's "lazily default
// if missing" pattern for approval_policy) drives both the employee dashboard
// banner (src/server/employee/reminder-banner.ts) and the HR "Benefit
// reminders" settings screen (src/app/(app)/reminders/).
// server-only: never import this from a Client Component.
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  benefitCategories,
  benefitClaims,
  benefitReminderSettings,
  users,
  type BenefitReminderSettingsRow,
} from "@/db/schema";
import { assertCan, type AppRole } from "@/server/auth/rbac";
import { currentFy } from "@/lib/fy";
import { LEAD_DAY_OPTIONS } from "@/lib/reminder-constants";

export type { BenefitReminderSettingsRow };
export { LEAD_DAY_OPTIONS };

const SETTINGS_ID = "default";

// Same convention as src/server/employee/balances.ts — approved/used and
// reserved/pending both reduce "available"; draft/rejected reduce nothing.
const RELEVANT_STATUSES = ["auto_approved", "approved", "reimbursed", "pending_hr", "submitted"] as const;

/**
 * The active reminder settings row. Lazily creates the default row on first
 * read (HR hasn't configured anything yet) — never throws in the request path.
 */
export async function loadReminderSettings(): Promise<BenefitReminderSettingsRow> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(benefitReminderSettings)
    .where(eq(benefitReminderSettings.id, SETTINGS_ID))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(benefitReminderSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost a race with a concurrent first-read — re-select the row the winner created.
  const [row] = await db
    .select()
    .from(benefitReminderSettings)
    .where(eq(benefitReminderSettings.id, SETTINGS_ID))
    .limit(1);
  return row!;
}

export type UpsertReminderSettingsInput = {
  leadDaysBeforeFyEnd: number[];
  frequency: "once" | "weekly" | "daily";
  dashboardEnabled: boolean;
  emailEnabled: boolean;
  thresholdPaise: number;
  actorId: string;
  actorRole: AppRole;
};

/**
 * Upsert the single settings row. HR-Head/Admin only (checked here in addition
 * to the calling Server Action, defense in depth). Every save writes an
 * auditLog row for traceability, mirroring upsertThreshold (KAN-74).
 */
export async function upsertReminderSettings(
  input: UpsertReminderSettingsInput,
): Promise<BenefitReminderSettingsRow> {
  assertCan(input.actorRole, "configurePolicy");
  const db = getDb();

  const leadDaysBeforeFyEnd = Array.from(
    new Set(input.leadDaysBeforeFyEnd.filter((d) => (LEAD_DAY_OPTIONS as readonly number[]).includes(d))),
  ).sort((a, b) => b - a);
  const thresholdPaise = Math.max(0, Math.round(input.thresholdPaise));

  const values = {
    id: SETTINGS_ID,
    leadDaysBeforeFyEnd,
    frequency: input.frequency,
    dashboardEnabled: input.dashboardEnabled,
    emailEnabled: input.emailEnabled,
    thresholdPaise,
    updatedAt: new Date(),
    updatedBy: input.actorId,
  };

  const [row] = await db
    .insert(benefitReminderSettings)
    .values(values)
    .onConflictDoUpdate({
      target: benefitReminderSettings.id,
      set: {
        leadDaysBeforeFyEnd: values.leadDaysBeforeFyEnd,
        frequency: values.frequency,
        dashboardEnabled: values.dashboardEnabled,
        emailEnabled: values.emailEnabled,
        thresholdPaise: values.thresholdPaise,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    })
    .returning();

  await db.insert(auditLog).values({
    actorId: input.actorId,
    action: "benefit_reminder_settings.upsert",
    entity: "benefit_reminder_settings",
    entityId: row.id,
    payload: {
      leadDaysBeforeFyEnd: row.leadDaysBeforeFyEnd,
      frequency: row.frequency,
      dashboardEnabled: row.dashboardEnabled,
      emailEnabled: row.emailEnabled,
      thresholdPaise: row.thresholdPaise,
    },
  });

  return row;
}

/**
 * How many employees currently have total unused benefit balance (across all
 * categories, current FY) above `thresholdPaise`. One aggregate query — a
 * LEFT JOIN + GROUP BY, not one getCategoryBalances() call per user — using the
 * same APPROVED/PENDING status set as src/server/employee/balances.ts.
 */
export async function getReminderAudienceCount(thresholdPaise: number): Promise<number> {
  const db = getDb();
  const fy = currentFy().label;

  const [{ totalCapPaise }] = await db
    .select({ totalCapPaise: sql<number>`coalesce(sum(${benefitCategories.annualCapPaise}), 0)` })
    .from(benefitCategories);
  if (!totalCapPaise) return 0;

  const rows = await db
    .select({
      userId: users.id,
      usedPaise: sql<number>`coalesce(sum(${benefitClaims.amountPaise}), 0)`,
    })
    .from(users)
    .leftJoin(
      benefitClaims,
      and(
        eq(benefitClaims.userId, users.id),
        eq(benefitClaims.fy, fy),
        inArray(benefitClaims.status, RELEVANT_STATUSES),
      ),
    )
    .groupBy(users.id);

  let qualifying = 0;
  for (const row of rows) {
    const available = Number(totalCapPaise) - Number(row.usedPaise);
    if (available > thresholdPaise) qualifying++;
  }
  return qualifying;
}
