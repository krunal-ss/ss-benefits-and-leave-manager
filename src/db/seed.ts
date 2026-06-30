// Seed reference data + demo approvers. Run with `pnpm db:seed` (needs DATABASE_URL).
// Idempotent: safe to run repeatedly.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to seed.");

  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });

  // Leave types (CL/SL/EL/LOP). KAN-43: structured accrual config —
  // accrualPerMonthDays + openingBalanceDays drive src/server/leave/accrual.ts;
  // accrualRule stays as the human-readable descriptor.
  await db
    .insert(schema.leaveTypes)
    .values([
      {
        code: "CL",
        name: "Casual Leave",
        accrualRule: "1 day/month, max 12, no carry-forward",
        accrualPerMonthDays: "1",
        openingBalanceDays: "0",
        maxBalanceDays: "12",
        deductsBalance: true,
      },
      {
        code: "SL",
        name: "Sick Leave",
        accrualRule: "8 days granted up-front, max 8, no carry-forward",
        accrualPerMonthDays: "0",
        openingBalanceDays: "8",
        maxBalanceDays: "8",
        deductsBalance: true,
      },
      {
        code: "EL",
        name: "Earned Leave",
        accrualRule: "1.5 days/month, max 18, carries forward",
        accrualPerMonthDays: "1.5",
        openingBalanceDays: "0",
        maxBalanceDays: "18",
        carryForward: true,
        deductsBalance: true,
      },
      {
        code: "LOP",
        name: "Loss of Pay",
        accrualRule: "Unpaid — no balance",
        accrualPerMonthDays: "0",
        openingBalanceDays: "0",
        maxBalanceDays: "0",
        deductsBalance: false,
      },
    ])
    .onConflictDoNothing({ target: schema.leaveTypes.code });

  // Benefit categories — insert once (Sports ₹15,000 / Learning ₹45,000).
  const cats = await db.select().from(schema.benefitCategories);
  if (cats.length === 0) {
    await db.insert(schema.benefitCategories).values([
      { name: "Sports", annualCapPaise: 1_500_000 },
      { name: "Learning", annualCapPaise: 4_500_000 },
    ]);
  }

  // Demo reporting line (approvers).
  await db
    .insert(schema.users)
    .values([
      { name: "Priya Nair", email: "priya@smartsense.example", role: "team_lead", department: "Engineering" },
      { name: "Vikram Rao", email: "vikram@smartsense.example", role: "project_manager", department: "Engineering" },
      { name: "Rohan Mehta", email: "rohan@smartsense.example", role: "hr_head", department: "HR" },
    ])
    .onConflictDoNothing({ target: schema.users.email });

  // Org holiday used by the working-day calc / calendar.
  const holiday = await db.select().from(schema.holidays).where(eq(schema.holidays.date, "2026-07-17"));
  if (holiday.length === 0) {
    await db.insert(schema.holidays).values({ date: "2026-07-17", name: "Holiday" });
  }

  await client.end();
  console.log("✓ Seed complete: leave types, benefit categories, approvers, holiday.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
