// Drizzle client over Supabase Postgres. Lazily instantiated so importing this
// module never opens a connection (or reads env) at build time.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

export function getDb(): Database {
  if (cached) return cached;
  const client = postgres(getEnv().DATABASE_URL, { prepare: false });
  cached = drizzle(client, { schema });
  return cached;
}

export { schema };
