import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

// People an employee can pick as their approvers when applying for leave/WFH.
// Reporting lines are DATA, so the choices are the real users holding each role.

export type ApproverOption = { id: string; name: string };

export async function listApproverOptions(): Promise<{
  teamLeads: ApproverOption[];
  projectManagers: ApproverOption[];
}> {
  const db = getDb();
  const [teamLeads, projectManagers] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "team_lead")).orderBy(asc(users.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.role, "project_manager"))
      .orderBy(asc(users.name)),
  ]);
  return { teamLeads, projectManagers };
}
