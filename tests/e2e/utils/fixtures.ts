// Sprint 1 E2E fixtures: fixed approver accounts (Team Lead / Project Manager /
// HR Head can't self-signup with a privileged role — see SIGNUP_ROLES) plus the
// base reference data the app needs to function (leave types, benefit
// categories, a holiday). Idempotent — safe to run against the same live
// Supabase project on every suite run.
import { and, desc, eq } from "drizzle-orm";
import { testDb, supabaseAdmin, schema } from "./db";

export const TEST_PASSWORD = "E2eTest#12345";

export const FIXED_USERS = {
  teamLead: { email: "e2e.teamlead@example.com", name: "E2E Team Lead", role: "team_lead" as const },
  projectManager: { email: "e2e.pm@example.com", name: "E2E Project Manager", role: "project_manager" as const },
  hrHead: { email: "e2e.hrhead@example.com", name: "E2E HR Head", role: "hr_head" as const },
};

async function ensureAuthUser(email: string, password: string): Promise<string> {
  const admin = supabaseAdmin();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) return created.data.user.id;

  // Already exists from a previous run — look it up and pin the password so
  // login stays deterministic regardless of what the last run left behind.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) {
      await admin.auth.admin.updateUserById(match.id, { password });
      return match.id;
    }
    if (data.users.length < 200) break;
    page++;
  }
  throw new Error(`Could not create or find the E2E auth user for ${email}`);
}

/** Create (or repair) the 3 fixed approver accounts — Auth identity + DB row with the right role. */
export async function ensureFixedUsers(): Promise<void> {
  const db = testDb();
  for (const u of Object.values(FIXED_USERS)) {
    await ensureAuthUser(u.email, TEST_PASSWORD);
    await db
      .insert(schema.users)
      .values({ name: u.name, email: u.email, role: u.role, department: "Engineering" })
      .onConflictDoUpdate({ target: schema.users.email, set: { role: u.role, name: u.name } });
  }
}

/** Reference data the app assumes exists (mirrors src/db/seed.ts). */
export async function ensureBaseData(): Promise<void> {
  const db = testDb();

  await db
    .insert(schema.leaveTypes)
    .values([
      { code: "CL", name: "Casual Leave", accrualRule: "1 day/month, max 12, no carry-forward", accrualPerMonthDays: "1", openingBalanceDays: "0", maxBalanceDays: "12", deductsBalance: true },
      { code: "SL", name: "Sick Leave", accrualRule: "8 days granted up-front, max 8, no carry-forward", accrualPerMonthDays: "0", openingBalanceDays: "8", maxBalanceDays: "8", deductsBalance: true },
      { code: "EL", name: "Earned Leave", accrualRule: "1.5 days/month, max 18, carries forward", accrualPerMonthDays: "1.5", openingBalanceDays: "0", maxBalanceDays: "18", carryForward: true, deductsBalance: true },
      { code: "LOP", name: "Loss of Pay", accrualRule: "Unpaid — no balance", accrualPerMonthDays: "0", openingBalanceDays: "0", maxBalanceDays: "0", deductsBalance: false },
    ])
    .onConflictDoNothing({ target: schema.leaveTypes.code });

  const cats = await db.select().from(schema.benefitCategories);
  if (cats.length === 0) {
    await db.insert(schema.benefitCategories).values([
      { name: "Sports", annualCapPaise: 1_500_000 },
      { name: "Learning", annualCapPaise: 4_500_000 },
    ]);
  }

  await db.insert(schema.holidays).values({ date: "2026-07-17", name: "Holiday" }).onConflictDoNothing();
}

/**
 * Sprint 1's routing behaviour is sequential TL→PM with no auto-approve. A
 * later sprint (KAN-46) made this configurable via the admin console, so a
 * prior run/demo may have left a different policy row — pin it back so
 * Sprint 1 leave-approval tests are deterministic regardless of history.
 */
export async function resetApprovalPolicy(): Promise<void> {
  const db = testDb();
  await db
    .insert(schema.approvalPolicy)
    .values({ id: "default", routingMode: "sequential", wfhAutoApproveMaxDays: "0", ccEmails: [] })
    .onConflictDoUpdate({
      target: schema.approvalPolicy.id,
      set: { routingMode: "sequential", wfhAutoApproveMaxDays: "0", ccEmails: [] },
    });
}

/** Point an employee's reporting line at the fixed TL/PM — calendar + leave-form defaults key off `users.teamLeadId/projectManagerId`, not the per-request approver choice. */
export async function wireReportingLine(employeeEmail: string): Promise<void> {
  const db = testDb();
  const [tl] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, FIXED_USERS.teamLead.email)).limit(1);
  const [pm] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, FIXED_USERS.projectManager.email)).limit(1);
  if (!tl || !pm) throw new Error("Fixed approver accounts are missing — did global setup run?");
  await db
    .update(schema.users)
    .set({ teamLeadId: tl.id, projectManagerId: pm.id })
    .where(eq(schema.users.email, employeeEmail));
}

/**
 * KAN-75: point an employee's reporting line at an arbitrary Team Lead/Project
 * Manager id (not necessarily the fixed one) — used by the availability-heatmap
 * tests, which need a manager with a small, test-controlled headcount rather
 * than the shared fixed Team Lead (whose reports accumulate across every spec
 * file/run against the live DB, making an exact % assertion impossible).
 */
export async function wireTeamLead(employeeEmail: string, teamLeadId: string): Promise<void> {
  const db = testDb();
  await db.update(schema.users).set({ teamLeadId }).where(eq(schema.users.email, employeeEmail));
}

/**
 * KAN-77: put a user in a specific department — the staffing guard resolves a
 * department-scoped threshold override via `users.department`, and signup
 * doesn't collect one, so tests wire it directly for deterministic scoping
 * (a fresh, unique department per test avoids any cross-test interference).
 */
export async function setUserDepartment(employeeEmail: string, department: string): Promise<void> {
  const db = testDb();
  await db.update(schema.users).set({ department }).where(eq(schema.users.email, employeeEmail));
}

/** KAN-77: flag/unflag a user as a sole/critical-skill holder for the staffing guard's critical-role check. */
export async function setCriticalRole(employeeEmail: string, isCriticalRole: boolean): Promise<void> {
  const db = testDb();
  await db.update(schema.users).set({ isCriticalRole }).where(eq(schema.users.email, employeeEmail));
}

/** KAN-206: set a user's office/region for the holiday countdown widget's location filter. */
export async function setUserLocation(employeeEmail: string, location: string): Promise<void> {
  const db = testDb();
  await db.update(schema.users).set({ location }).where(eq(schema.users.email, employeeEmail));
}

/**
 * KAN-77: create a department-scoped staffing threshold override directly
 * (bypassing the HR settings UI) so a test's team has a known, isolated
 * threshold regardless of whatever the shared org-wide default happens to be
 * at the time the suite runs (department overrides always win — see
 * staffing-guard.ts). Always inserts a fresh row; pass a unique department
 * name per test.
 */
export async function setDepartmentThreshold(department: string, minAvailablePercent: number): Promise<void> {
  const db = testDb();
  await db.insert(schema.staffingThreshold).values({ scope: "department", scopeValue: department, minAvailablePercent });
}

/**
 * KAN-52: the receipt-upload flow writes to the private `receipts` bucket, so it
 * must exist. Idempotent — creates it if missing, tolerates "already exists".
 * Arrangement only, via the service-role admin client. (Literal bucket name kept
 * in sync with RECEIPTS_BUCKET in src/server/supabase/storage.ts, which can't be
 * imported here — it's a `server-only` module.)
 *
 * Returns `true` once the bucket exists, or `false` if the Storage endpoint is
 * unreachable after retries (Supabase Storage DNS is occasionally flaky here —
 * same reason global-setup retries). The caller skips the upload specs on
 * `false` rather than hard-failing on transient infra; a genuine (non-network)
 * error still throws.
 */
export async function ensureReceiptsBucket(): Promise<boolean> {
  const admin = supabaseAdmin();
  const isNetworkError = (msg: string) =>
    /fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network/i.test(msg);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await admin.storage.createBucket("receipts", { public: false });
      if (error && !/exist/i.test(error.message)) throw error;
      return true; // created now, or already present
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isNetworkError(msg)) throw err; // a real config/permission error — surface it
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.warn(
    `ensureReceiptsBucket: Supabase Storage unreachable after retries — ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
  return false;
}

/**
 * KAN-187 — the leave-policy PDF upload flow writes to the private
 * `policy-docs` bucket, so it must exist. Same idempotent/retry shape as
 * ensureReceiptsBucket above (literal name kept in sync with
 * POLICY_DOCS_BUCKET in src/server/supabase/storage.ts).
 */
export async function ensurePolicyDocsBucket(): Promise<boolean> {
  const admin = supabaseAdmin();
  const isNetworkError = (msg: string) =>
    /fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network/i.test(msg);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await admin.storage.createBucket("policy-docs", { public: false });
      if (error && !/exist/i.test(error.message)) throw error;
      return true;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isNetworkError(msg)) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  console.warn(
    `ensurePolicyDocsBucket: Supabase Storage unreachable after retries — ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
  return false;
}

export async function getUserIdByEmail(email: string): Promise<string> {
  const db = testDb();
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!row) throw new Error(`No users row for ${email} yet — has this account logged in once?`);
  return row.id;
}

/**
 * KAN-147: the SLA clock starts at `createdAt`, set by the DB on insert — no
 * UI flow can control it, so an "overdue" fixture backdates it directly. Finds
 * the most recently created pending-HR claim for the given applicant email
 * (there's exactly one per test) and pushes its `createdAt` back so it's past
 * the 48h expense SLA target.
 */
export async function backdateNewestPendingClaim(applicantEmail: string, hoursAgo: number): Promise<void> {
  const db = testDb();
  const userId = await getUserIdByEmail(applicantEmail);
  const [claim] = await db
    .select({ id: schema.benefitClaims.id })
    .from(schema.benefitClaims)
    .where(and(eq(schema.benefitClaims.userId, userId), eq(schema.benefitClaims.status, "pending_hr")))
    .orderBy(desc(schema.benefitClaims.createdAt))
    .limit(1);
  if (!claim) throw new Error(`No pending_hr claim found for ${applicantEmail} — did submission land in pending_hr?`);
  await db
    .update(schema.benefitClaims)
    .set({ createdAt: new Date(Date.now() - hoursAgo * 3600_000) })
    .where(eq(schema.benefitClaims.id, claim.id));
}

/** KAN-147: same idea as `backdateNewestPendingClaim`, for a pending leave/WFH request awaiting L1/L2 decision. */
export async function backdateNewestPendingLeaveRequest(applicantEmail: string, hoursAgo: number): Promise<void> {
  const db = testDb();
  const userId = await getUserIdByEmail(applicantEmail);
  const [request] = await db
    .select({ id: schema.leaveRequests.id })
    .from(schema.leaveRequests)
    .where(eq(schema.leaveRequests.userId, userId))
    .orderBy(desc(schema.leaveRequests.createdAt))
    .limit(1);
  if (!request) throw new Error(`No leave request found for ${applicantEmail}.`);
  await db
    .update(schema.leaveRequests)
    .set({ createdAt: new Date(Date.now() - hoursAgo * 3600_000) })
    .where(eq(schema.leaveRequests.id, request.id));
}
