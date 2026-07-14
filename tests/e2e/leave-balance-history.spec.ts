// KAN-167: Leave Balance History — a per-leave-type ledger derived from
// leaveTypes/leaveBalances/auditLog (src/server/employee/leave-ledger.ts).
// A brand-new employee's balances are seeded straight to `maxBalanceDays`
// (see ensureLeaveBalances in current-user.ts), bypassing the opening-balance
// audit trail entirely — so a reconciliation "Balance adjustment" row is
// expected for Casual/Earned Leave (whose seeded max differs from their
// openingBalanceDays), but not for Sick Leave (whose opening already equals
// its max).
import { test, expect, type Page } from "@playwright/test";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "History-Pass1";
const TL = FIXED_USERS.teamLead;
const PM = FIXED_USERS.projectManager;

/** The fixed approver queues accumulate cards across specs — scope to one employee's card. */
function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

async function openHistoryTab(page: Page) {
  await page.goto("/leave");
  await page.getByRole("tablist", { name: "My leave requests view" }).getByRole("tab", { name: "Balance history" }).click();
  await expect(page.getByRole("heading", { name: "Balance history" })).toBeVisible();
}

test("Balance history reconciles a freshly-seeded balance and reflects an approved leave's deduction, matching the balance shown on the apply form", async ({ page }) => {
  const name = uniqueName("Neha Kulkarni");
  const email = uniqueEmail("history-basic");
  await signup(page, { name, email, password: PASSWORD });

  // Brand-new employee, before any leave request: Casual Leave is seeded
  // straight to maxBalanceDays (12), bypassing openingBalanceDays (0) — the
  // ledger must still reconcile to the real stored balance via an adjustment.
  await openHistoryTab(page);
  const clRows = page.locator("table tbody tr", { hasText: "Casual Leave" });
  await expect(clRows.filter({ hasText: "Balance adjustment" })).toBeVisible();
  await expect(clRows.filter({ hasText: "Opening balance" })).toBeVisible();
  // Newest (topmost) Casual Leave row is the reconciling adjustment — it
  // closes exactly on the real stored balance of 12.
  await expect(clRows.first().locator("td").last()).toHaveText("12");

  // Sick Leave's opening balance (8) already equals its seeded balance
  // exactly — no reconciliation needed.
  const slRows = page.locator("table tbody tr", { hasText: "Sick Leave" });
  await expect(slRows.filter({ hasText: "Balance adjustment" })).toHaveCount(0);
  await expect(slRows.first().locator("td").last()).toHaveText("8");

  // Apply for + fully approve a 2-day Casual Leave request — deducts the
  // balance to 10 and writes a real `deduct_leave_balance` audit row.
  const { from, to } = pickWorkdayRange(2, 6);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "Personal" });
  await expect(page.getByText(`Request submitted — sent to ${TL.name} (L1)`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  await approvalCardFor(page, name).getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await approvalCardFor(page, name).getByRole("button", { name: "Approve (final)" }).click();
  await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email, password: PASSWORD });

  // The apply form itself shows the post-deduction balance for Casual Leave.
  await page.goto("/leave");
  await expect(page.getByText("10 days")).toBeVisible();

  // The Balance History view's newest Casual Leave row must agree exactly.
  await openHistoryTab(page);
  const clRowsAfter = page.locator("table tbody tr", { hasText: "Casual Leave" });
  await expect(clRowsAfter.filter({ hasText: "Leave taken" })).toBeVisible();
  await expect(clRowsAfter.first().locator("td").last()).toHaveText("10");
});

test("Balance history CSV export downloads a file scoped to the current FY", async ({ page }) => {
  await signup(page, { name: uniqueName("Rakesh Iyer"), email: uniqueEmail("history-csv"), password: PASSWORD });
  await openHistoryTab(page);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^leave-balance-history-\d{4}-\d{2}\.csv$/);
});

test("Balance history only ever shows the signed-in user's own data", async ({ page }) => {
  // User A applies for and gets 2 days of Casual Leave approved, dropping
  // their balance to 10.
  const nameA = uniqueName("Owner A");
  const emailA = uniqueEmail("history-owner-a");
  await signup(page, { name: nameA, email: emailA, password: PASSWORD });
  const { from, to } = pickWorkdayRange(2, 6);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "Trip" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  await approvalCardFor(page, nameA).getByRole("button", { name: "Approve → L2" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await approvalCardFor(page, nameA).getByRole("button", { name: "Approve (final)" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  // There is no route param / query string on /leave that could target
  // another user's id — the page always resolves the history for whoever is
  // currently authenticated via getCurrentUser().
  await expect(page).toHaveURL(/\/leave$/);

  // A brand-new, unrelated User B signs up and opens their OWN Balance
  // History — it must show their own fresh 12-day balance, never User A's
  // deduction or altered 10-day balance.
  const emailB = uniqueEmail("history-owner-b");
  await signup(page, { name: uniqueName("Owner B"), email: emailB, password: PASSWORD });
  await openHistoryTab(page);

  const clRowsB = page.locator("table tbody tr", { hasText: "Casual Leave" });
  await expect(clRowsB.filter({ hasText: "Leave taken" })).toHaveCount(0);
  await expect(clRowsB.first().locator("td").last()).toHaveText("12");
});
