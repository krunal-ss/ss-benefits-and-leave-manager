// Provision the HR Head login and retire any previous HR Head.
//   - Creates the Supabase Auth user kp@smartsense.com (password set, email confirmed)
//   - Upserts the matching `users` row with role hr_head
//   - Seeds their leave balances for the current FY
//   - Removes every other hr_head user (DB row + Auth account + leave balances)
// Idempotent: safe to run repeatedly. Run with `pnpm db:seed:hr`.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient, type SupabaseClient, type User as AuthUser } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, ne } from "drizzle-orm";
import * as schema from "./schema";

const HR_EMAIL = "kp@smartsense.com";
const HR_PASSWORD = "Password@123456";
const HR_NAME = "KP";
const HR_DEPT = "HR";

function currentFyLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() + 1 >= 4 ? y : y - 1; // FY starts 1 Apr
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Find an existing Auth user by email (paged), since the admin API has no direct lookup. */
async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<AuthUser | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl) throw new Error("DATABASE_URL is required.");
  if (!supabaseUrl || !serviceKey)
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to manage the Auth user.");

  const admin: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const client = postgres(dbUrl, { prepare: false });
  const db = drizzle(client, { schema });

  // 1) Ensure the Supabase Auth account exists with the requested password.
  let authUser = await findAuthUserByEmail(admin, HR_EMAIL);
  if (authUser) {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password: HR_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: HR_NAME },
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`• Auth user already existed — password reset (${HR_EMAIL}).`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: HR_EMAIL,
      password: HR_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: HR_NAME },
    });
    if (error) throw error;
    authUser = data.user;
    console.log(`• Created Auth user ${HR_EMAIL}.`);
  }
  const authId = authUser!.id;

  // 2) Remove previous HR Head users (DB rows, their balances, and Auth accounts).
  const oldHr = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(and(eq(schema.users.role, "hr_head"), ne(schema.users.email, HR_EMAIL)));
  for (const u of oldHr) {
    await db.delete(schema.leaveBalances).where(eq(schema.leaveBalances.userId, u.id));
    await db.delete(schema.users).where(eq(schema.users.id, u.id));
    const oldAuth = await findAuthUserByEmail(admin, u.email);
    if (oldAuth) await admin.auth.admin.deleteUser(oldAuth.id).catch(() => {});
    console.log(`• Removed previous HR Head: ${u.email}.`);
  }
  if (oldHr.length === 0) console.log("• No previous HR Head to remove.");

  // 3) Upsert the DB user row for the new HR Head (role is set here — never self-selected).
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, HR_EMAIL))
    .limit(1);
  if (existing[0]) {
    await db
      .update(schema.users)
      .set({ name: HR_NAME, role: "hr_head", department: HR_DEPT })
      .where(eq(schema.users.email, HR_EMAIL));
    console.log("• Updated existing users row → role hr_head.");
  } else {
    await db.insert(schema.users).values({
      id: authId,
      email: HR_EMAIL,
      name: HR_NAME,
      role: "hr_head",
      department: HR_DEPT,
    });
    console.log("• Inserted users row with role hr_head.");
  }
  const [dbUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, HR_EMAIL))
    .limit(1);

  // 4) Seed leave balances for the current FY (so HR can also apply leave/WFH).
  const fy = currentFyLabel();
  const types = await db.select().from(schema.leaveTypes);
  for (const t of types) {
    const has = await db
      .select({ id: schema.leaveBalances.id })
      .from(schema.leaveBalances)
      .where(
        and(
          eq(schema.leaveBalances.userId, dbUser.id),
          eq(schema.leaveBalances.leaveTypeId, t.id),
          eq(schema.leaveBalances.fy, fy),
        ),
      )
      .limit(1);
    if (has[0]) continue;
    await db.insert(schema.leaveBalances).values({
      userId: dbUser.id,
      leaveTypeId: t.id,
      fy,
      balanceDays: t.maxBalanceDays ?? "0",
    });
  }

  await client.end();
  console.log(`\n✓ HR Head ready. Log in with ${HR_EMAIL} / ${HR_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
