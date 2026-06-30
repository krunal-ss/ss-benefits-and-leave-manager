import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit isn't Next.js, so load .env.local explicitly (then .env as fallback).
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
