// Sprint 1 E2E fixtures: fixed approver accounts (Team Lead / Project Manager /
// HR Head can't self-signup with a privileged role — see SIGNUP_ROLES) plus the
// base reference data the app needs to function (leave types, benefit
// categories, a holiday). Idempotent — safe to run against the same live
// Supabase project on every suite run.
import { eq } from "drizzle-orm";
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
 * KAN-52: the receipt-upload flow writes to the private `receipts` bucket, so it
 * must exist. Idempotent — creates it if missing, tolerates "already exists".
 * Arrangement only, via the service-role admin client. (Literal bucket name kept
 * in sync with RECEIPTS_BUCKET in src/server/supabase/storage.ts, which can't be
 * imported here — it's a `server-only` module.)
 */
export async function ensureReceiptsBucket(): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.storage.createBucket("receipts", { public: false });
  if (error && !/exist/i.test(error.message)) throw error;
}

export async function getUserIdByEmail(email: string): Promise<string> {
  const db = testDb();
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!row) throw new Error(`No users row for ${email} yet — has this account logged in once?`);
  return row.id;
}
