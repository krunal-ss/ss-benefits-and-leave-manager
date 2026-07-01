import "server-only";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { benefitCategories, holidays, leaveTypes, users } from "@/db/schema";

// KAN-49: read services for the Admin console. Reads only — every mutation lives
// in a server action under src/server/admin/actions.ts (audited + capability-gated).

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  teamLeadId: string | null;
  projectManagerId: string | null;
};

export type ApproverOption = { id: string; name: string; email: string };

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const db = getDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      department: users.department,
      teamLeadId: users.teamLeadId,
      projectManagerId: users.projectManagerId,
    })
    .from(users)
    .orderBy(asc(users.name));
}

/** Everyone, as pickable approver options (any user may hold a reporting line). */
export async function listApproverOptions(): Promise<ApproverOption[]> {
  const db = getDb();
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.name));
}

export async function listBenefitCategories() {
  const db = getDb();
  return db.select().from(benefitCategories).orderBy(asc(benefitCategories.name));
}

export async function listLeaveTypes() {
  const db = getDb();
  return db.select().from(leaveTypes).orderBy(asc(leaveTypes.code));
}

export async function listHolidays() {
  const db = getDb();
  return db.select().from(holidays).orderBy(asc(holidays.date));
}
