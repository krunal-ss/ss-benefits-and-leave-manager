"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  auditLog,
  benefitCategories,
  holidays,
  leaveTypes,
  roleEnum,
  users,
} from "@/db/schema";
import { requireUser } from "@/server/auth/current-user";
import { assertCan, type Capability, ForbiddenError } from "@/server/auth/rbac";

// KAN-49 (KAN-71 BE): capability-gated, audited CRUD server actions for the Admin
// console — users & reporting lines, benefit categories & caps, leave types &
// accrual, and the holiday calendar. Every mutation writes an AuditLog row inside
// the same transaction, so config history is never silently changed.

export type ActionResult = { ok: boolean; message: string };

const ADMIN_PATH = "/admin";

type Ctx = { me: Awaited<ReturnType<typeof requireUser>>; db: ReturnType<typeof getDb> };

/**
 * Validate input, resolve+capability-check the actor, then run the mutation with
 * an authorized context. Zod failures and ForbiddenError become a friendly
 * result; anything else propagates. Revalidates the admin surface on success.
 */
async function run<T>(
  capability: Capability,
  parsed: z.ZodSafeParseResult<T>,
  fn: (data: T, ctx: Ctx) => Promise<string>,
): Promise<ActionResult> {
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const me = await requireUser();
    assertCan(me.role, capability);
    const message = await fn(parsed.data, { me, db: getDb() });
    for (const p of [ADMIN_PATH, "/dashboard"]) revalidatePath(p);
    return { ok: true, message };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, message: err.message };
    throw err;
  }
}

// A numeric string with up to 2 decimals (used for accrual/balance day fields).
const numStr = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0, `${label} must be a non-negative number.`);

// ---------------------------------------------------------------------------
// 1) Users + reporting lines (Admin only)
// ---------------------------------------------------------------------------

const updateUserSchema = z
  .object({
    userId: z.string().uuid("Invalid user."),
    role: z.enum(roleEnum.enumValues),
    department: z.string().trim().max(120).optional(),
    teamLeadId: z.string().uuid().nullable().optional(),
    projectManagerId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.teamLeadId !== d.userId, { message: "A user cannot be their own Team Lead." })
  .refine((d) => d.projectManagerId !== d.userId, { message: "A user cannot be their own Project Manager." });

export async function updateUserAction(input: z.input<typeof updateUserSchema>): Promise<ActionResult> {
  const parsed = updateUserSchema.safeParse(input);
  return run("manageUsers", parsed, async (d, { me, db }) => {
    const [existing] = await db.select().from(users).where(eq(users.id, d.userId)).limit(1);
    if (!existing) throw new ForbiddenError("User not found.");
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          role: d.role,
          department: d.department?.trim() || null,
          teamLeadId: d.teamLeadId ?? null,
          projectManagerId: d.projectManagerId ?? null,
        })
        .where(eq(users.id, d.userId));
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: "update_user",
        entity: "user",
        entityId: d.userId,
        payload: {
          before: {
            role: existing.role,
            department: existing.department,
            teamLeadId: existing.teamLeadId,
            projectManagerId: existing.projectManagerId,
          },
          after: {
            role: d.role,
            department: d.department?.trim() || null,
            teamLeadId: d.teamLeadId ?? null,
            projectManagerId: d.projectManagerId ?? null,
          },
        },
      });
    });
    return `Updated ${existing.name}.`;
  });
}

// ---------------------------------------------------------------------------
// 2) Benefit categories & caps (HR-Head / Admin). annualCap arrives in RUPEES
//    from the form and is stored as integer PAISE (never floats).
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  annualCapRupees: z
    .string()
    .trim()
    .refine((v) => v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0, "Annual cap must be a whole rupee amount."),
  fyStart: z
    .string()
    .trim()
    .regex(/^\d{2}-\d{2}$/, "FY start must be MM-DD.")
    .default("04-01"),
  carryover: z.boolean().default(false),
});

export async function saveBenefitCategoryAction(
  input: z.input<typeof categorySchema>,
): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  return run("configurePolicy", parsed, async (d, { me, db }) => {
    const annualCapPaise = Number(d.annualCapRupees) * 100;
    const values = { name: d.name, annualCapPaise, fyStart: d.fyStart, carryover: d.carryover };
    await db.transaction(async (tx) => {
      if (d.id) {
        await tx.update(benefitCategories).set(values).where(eq(benefitCategories.id, d.id));
      } else {
        const [created] = await tx.insert(benefitCategories).values(values).returning({ id: benefitCategories.id });
        d.id = created.id;
      }
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: input.id ? "update_benefit_category" : "create_benefit_category",
        entity: "benefit_category",
        entityId: d.id!,
        payload: values,
      });
    });
    return `Saved category "${d.name}".`;
  });
}

const deleteCategorySchema = z.object({ id: z.string().uuid("Invalid category.") });

export async function deleteBenefitCategoryAction(
  input: z.input<typeof deleteCategorySchema>,
): Promise<ActionResult> {
  const parsed = deleteCategorySchema.safeParse(input);
  return run("configurePolicy", parsed, async ({ id }, { me, db }) => {
    await db.transaction(async (tx) => {
      await tx.delete(benefitCategories).where(eq(benefitCategories.id, id));
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: "delete_benefit_category",
        entity: "benefit_category",
        entityId: id,
      });
    });
    return "Category deleted.";
  });
}

// ---------------------------------------------------------------------------
// 3) Leave types & accrual (HR-Head / Admin)
// ---------------------------------------------------------------------------

const leaveTypeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1, "Code is required.").max(12),
  name: z.string().trim().min(1, "Name is required.").max(120),
  accrualPerMonthDays: numStr("Monthly accrual"),
  openingBalanceDays: numStr("Opening balance"),
  maxBalanceDays: z
    .string()
    .trim()
    .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Max balance must be a non-negative number.")
    .optional(),
  carryForward: z.boolean().default(false),
  deductsBalance: z.boolean().default(true),
});

export async function saveLeaveTypeAction(input: z.input<typeof leaveTypeSchema>): Promise<ActionResult> {
  const parsed = leaveTypeSchema.safeParse(input);
  return run("configurePolicy", parsed, async (d, { me, db }) => {
    const values = {
      code: d.code.toUpperCase(),
      name: d.name,
      accrualPerMonthDays: d.accrualPerMonthDays,
      openingBalanceDays: d.openingBalanceDays,
      maxBalanceDays: d.maxBalanceDays && d.maxBalanceDays !== "" ? d.maxBalanceDays : null,
      carryForward: d.carryForward,
      deductsBalance: d.deductsBalance,
    };
    await db.transaction(async (tx) => {
      if (d.id) {
        await tx.update(leaveTypes).set(values).where(eq(leaveTypes.id, d.id));
      } else {
        const [created] = await tx.insert(leaveTypes).values(values).returning({ id: leaveTypes.id });
        d.id = created.id;
      }
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: input.id ? "update_leave_type" : "create_leave_type",
        entity: "leave_type",
        entityId: d.id!,
        payload: values,
      });
    });
    return `Saved leave type "${values.code}".`;
  });
}

const deleteLeaveTypeSchema = z.object({ id: z.string().uuid("Invalid leave type.") });

export async function deleteLeaveTypeAction(input: z.input<typeof deleteLeaveTypeSchema>): Promise<ActionResult> {
  const parsed = deleteLeaveTypeSchema.safeParse(input);
  return run("configurePolicy", parsed, async ({ id }, { me, db }) => {
    await db.transaction(async (tx) => {
      await tx.delete(leaveTypes).where(eq(leaveTypes.id, id));
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: "delete_leave_type",
        entity: "leave_type",
        entityId: id,
      });
    });
    return "Leave type deleted.";
  });
}

// ---------------------------------------------------------------------------
// 4) Holiday calendar (HR-Head / Admin)
// ---------------------------------------------------------------------------

const holidaySchema = z.object({
  id: z.string().uuid().optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  name: z.string().trim().min(1, "Name is required.").max(120),
  location: z.string().trim().max(120).optional(),
});

export async function saveHolidayAction(input: z.input<typeof holidaySchema>): Promise<ActionResult> {
  const parsed = holidaySchema.safeParse(input);
  return run("configurePolicy", parsed, async (d, { me, db }) => {
    const values = { date: d.date, name: d.name, location: d.location?.trim() || null };
    await db.transaction(async (tx) => {
      if (d.id) {
        await tx.update(holidays).set(values).where(eq(holidays.id, d.id));
      } else {
        const [created] = await tx.insert(holidays).values(values).returning({ id: holidays.id });
        d.id = created.id;
      }
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: input.id ? "update_holiday" : "create_holiday",
        entity: "holiday",
        entityId: d.id!,
        payload: values,
      });
    });
    return `Saved holiday "${d.name}".`;
  });
}

const deleteHolidaySchema = z.object({ id: z.string().uuid("Invalid holiday.") });

export async function deleteHolidayAction(input: z.input<typeof deleteHolidaySchema>): Promise<ActionResult> {
  const parsed = deleteHolidaySchema.safeParse(input);
  return run("configurePolicy", parsed, async ({ id }, { me, db }) => {
    await db.transaction(async (tx) => {
      await tx.delete(holidays).where(eq(holidays.id, id));
      await tx.insert(auditLog).values({
        actorId: me.id,
        action: "delete_holiday",
        entity: "holiday",
        entityId: id,
      });
    });
    return "Holiday deleted.";
  });
}
