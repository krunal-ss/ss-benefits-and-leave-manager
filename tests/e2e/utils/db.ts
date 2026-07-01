// Direct DB/Supabase-admin access for E2E test *arrangement* only (seeding fixed
// approver accounts, wiring reporting lines, resetting the approval policy).
// Specs must never use this to assert outcomes — assert on the UI, per the
// e2e-testing skill's rubric. Mirrors src/db/seed.ts's env loading.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import * as schema from "../../../src/db/schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function testDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for E2E tests — see .env.local.");
  const client = postgres(url, { prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required for E2E tests.");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export { schema };
