import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { getDb } from "@/db";
import { leaveBalances, leaveTypes, users, type User } from "@/db/schema";
import { canAccessPath, homeRouteFor, resolveSignupRole } from "@/server/users";
import { currentFy } from "@/lib/fy";

/**
 * The signed-in user as a DB row, creating it (and default leave balances for
 * the current FY) on first login. `cache` dedupes the work within one request.
 * Returns null when there is no Supabase session.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.email, authUser.email)).limit(1);
  if (existing[0]) return existing[0];

  const rawFullName = authUser.user_metadata?.full_name;
  const name =
    (typeof rawFullName === "string" ? rawFullName.trim() : "") || authUser.email.split("@")[0];

  // Role is self-selected at signup (carried in user_metadata.app_role), but
  // user_metadata is client-editable — resolveSignupRole whitelists it so a
  // tampered value can never self-grant hr_head/admin.
  const rawAppRole = authUser.user_metadata?.app_role;
  const role = resolveSignupRole(typeof rawAppRole === "string" ? rawAppRole : undefined);

  const [created] = await db
    .insert(users)
    .values({ id: authUser.id, email: authUser.email, name, role })
    .returning();

  await ensureLeaveBalances(created.id);
  return created;
});

/** Give a new user an opening balance per leave type for the current FY. */
async function ensureLeaveBalances(userId: string): Promise<void> {
  const db = getDb();
  const fy = currentFy().label;
  const types = await db.select().from(leaveTypes);
  for (const t of types) {
    const has = await db
      .select({ id: leaveBalances.id })
      .from(leaveBalances)
      .where(and(eq(leaveBalances.userId, userId), eq(leaveBalances.leaveTypeId, t.id), eq(leaveBalances.fy, fy)))
      .limit(1);
    if (has[0]) continue;
    await db.insert(leaveBalances).values({
      userId,
      leaveTypeId: t.id,
      fy,
      balanceDays: t.maxBalanceDays ?? "0",
    });
  }
}

/** Throwing variant for Server Actions / protected reads. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated.");
  return user;
}

/**
 * Page guard: returns the signed-in user, or redirects — to /login if there is
 * no session, or to their own home if their role can't access `path`. This is
 * the server-side RBAC gate; nav visibility is a convenience on top of it.
 */
export async function requireAccess(path: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessPath(user.role, path)) redirect(homeRouteFor(user.role));
  return user;
}
