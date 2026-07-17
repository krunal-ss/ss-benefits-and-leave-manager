import "server-only";
// KAN-208 (Team Leave Today Widget, part of KAN-204/205): today's team
// availability summary for the dashboard. Reuses the single day-level
// capacity calc (weekend/holiday exclusion, half-day=50%, WFH=available)
// from getAvailabilityForRange (src/server/manager/availability.ts) — this
// module only resolves WHICH user ids count as "the team" for the viewer's
// role, it never recomputes the availability math itself.
//
// Scope resolution (deliberately distinct from resolveTeamScope, which
// enforces the heatmap's TL/PM/HR/Admin-only ownership rule):
//  - Team Lead / Project Manager: their own direct reports.
//  - Employee: the other direct reports of their own Team Lead (else
//    Project Manager) — i.e. their peers, resolved from reporting-line DATA.
//  - HR Head / Admin: every user in the org (org-wide, matches "HR sees
//    across the org" elsewhere, e.g. the KAN-78 department overview).
import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { getAvailabilityForRange } from "@/server/manager/availability";
import { todayISO } from "@/lib/fy";

export type TeamAvailabilityToday = {
  teamLabel: string;
  headcount: number;
  availableCount: number;
  onLeaveCount: number;
  onWfhCount: number;
  /** Rounded 0-100, or null on a non-working day / zero headcount. */
  availablePct: number | null;
  isWorkingDay: boolean;
};

const EMPTY: TeamAvailabilityToday = {
  teamLabel: "",
  headcount: 0,
  availableCount: 0,
  onLeaveCount: 0,
  onWfhCount: 0,
  availablePct: null,
  isWorkingDay: false,
};

async function resolveTodayScope(user: User): Promise<{ reportIds: string[]; teamLabel: string } | null> {
  const db = getDb();

  if (user.role === "hr_head" || user.role === "admin") {
    const rows = await db.select({ id: users.id }).from(users);
    return { reportIds: rows.map((r) => r.id), teamLabel: "Organization" };
  }

  const managerId =
    user.role === "team_lead" || user.role === "project_manager" ? user.id : user.teamLeadId ?? user.projectManagerId;
  if (!managerId) return null;

  const reports = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.teamLeadId, managerId), eq(users.projectManagerId, managerId)));
  const reportIds = reports.map((r) => r.id);
  if (reportIds.length === 0) return null;

  if (managerId === user.id) return { reportIds, teamLabel: "Your team" };
  const [manager] = await db.select({ name: users.name }).from(users).where(eq(users.id, managerId));
  return { reportIds, teamLabel: manager ? `${manager.name}'s team` : "Your team" };
}

/** Today's available/on-leave/WFH counts + % for the viewer's team, scoped by role. */
export async function getTeamAvailabilityToday(user: User): Promise<TeamAvailabilityToday> {
  const scope = await resolveTodayScope(user);
  if (!scope) return EMPTY;

  const today = todayISO();
  const [day] = await getAvailabilityForRange(scope.reportIds, today, today);
  if (!day) return { ...EMPTY, teamLabel: scope.teamLabel };

  return {
    teamLabel: scope.teamLabel,
    headcount: day.headcount,
    availableCount: day.availableCount,
    onLeaveCount: day.onLeave,
    onWfhCount: day.onWfh,
    availablePct: day.availablePct,
    isWorkingDay: day.isWorkingDay,
  };
}
