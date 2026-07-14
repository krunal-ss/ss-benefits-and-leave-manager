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
        summary: "Short, planned personal time off.",
        eligibility: [
          "All confirmed full-time employees (after the 90-day probation).",
          "Interns and contractors are not eligible.",
          "Pro-rated in the joining year based on the month you joined.",
        ],
        approver: "Reporting manager",
        noticeText: "Apply 1 working day in advance",
        encashText: "Not encashable",
        carryHeadline: "Does not carry forward",
        carryText:
          "Unused Casual Leave lapses at the end of the financial year (31 Mar). It does not roll into the next year and is not encashed.",
        processSteps: [
          "Open Apply leave / WFH from the sidebar",
          "Choose Casual Leave and pick your dates",
          "Add a short reason and submit",
          "Your manager approves — the balance is deducted on approval",
        ],
        faqs: [
          {
            q: "Can I take Casual Leave for half a day?",
            a: "Yes. Toggle the half-day option when applying; it counts as 0.5 day against your balance.",
          },
          {
            q: "What happens if I have no Casual Leave left?",
            a: "Extra days are automatically marked as Loss of Pay (LOP) unless you have another applicable balance.",
          },
          {
            q: "Can Casual Leave be clubbed with weekends?",
            a: "Yes, but intervening weekends and public holidays are not counted as leave days.",
          },
        ],
      },
      {
        code: "SL",
        name: "Sick Leave",
        accrualRule: "8 days granted up-front, max 8, no carry-forward",
        accrualPerMonthDays: "0",
        openingBalanceDays: "8",
        maxBalanceDays: "8",
        deductsBalance: true,
        summary: "Time off for illness and recovery.",
        eligibility: [
          "All confirmed full-time employees.",
          "A medical certificate is required for absences longer than 2 consecutive days.",
        ],
        approver: "Reporting manager",
        noticeText: "Inform manager by 10:00 AM on the day",
        encashText: "Not encashable",
        carryHeadline: "Does not carry forward",
        carryText: "Unused Sick Leave lapses at year-end and cannot be encashed or carried into the next year.",
        processSteps: [
          "Apply via Apply leave / WFH as soon as you are able",
          "Attach a medical certificate for 3+ days",
          "Manager approves; HR is notified for extended leave",
        ],
        faqs: [
          {
            q: "Do I need to apply before taking sick leave?",
            a: "Notify your manager as early as possible. You can file the request in the portal once you are able to.",
          },
          {
            q: "What counts as extended sick leave?",
            a: "More than 2 consecutive days requires a medical certificate uploaded with the request.",
          },
        ],
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
        summary: "Accrued privilege leave for longer breaks.",
        eligibility: ["All confirmed full-time employees.", "Recommended for planned vacations and travel."],
        approver: "Manager + HR for 5+ days",
        noticeText: "Apply 7 working days in advance",
        encashText: "Encashable at year-end",
        carryHeadline: "Carries forward — up to the plan's max balance",
        carryText:
          "Unused Earned Leave carries into the next financial year up to the configured maximum balance. Anything above the cap is encashed at basic pay in the March payroll.",
        processSteps: [
          "Apply via Apply leave / WFH at least 7 days ahead",
          "Requests of 5+ days route to HR after manager approval",
          "Balance is held on submission and deducted on final approval",
        ],
        faqs: [
          {
            q: "How much Earned Leave can I carry over?",
            a: "Up to the maximum balance shown above. Days beyond the cap are automatically encashed at year-end.",
          },
          {
            q: "Is Earned Leave encashable if I resign?",
            a: "Yes, your accrued and unused Earned Leave balance is paid out in the final settlement.",
          },
          {
            q: "Can I take Earned Leave during probation?",
            a: "No. It accrues during probation but can only be availed after confirmation.",
          },
        ],
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
