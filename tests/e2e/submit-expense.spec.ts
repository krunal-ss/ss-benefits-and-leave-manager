// KAN-14 (submit + live dashboard balances) & KAN-15 (auto-verification engine
// + HR approval queue). Every claim here is submitted WITHOUT a receipt file —
// ANTHROPIC_API_KEY isn't configured for real OCR in this environment, and
// verification.ts fails "File readable" (and therefore never auto-approves)
// whenever there's no document. That's exactly the hard rule this suite must
// prove: an inconclusive claim is NEVER auto-approved, it always routes to HR —
// so the no-receipt path is the deterministic way to exercise it end to end.
import { test, expect, type Page } from "@playwright/test";
import { login, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";

const PASSWORD = "Expense-Pass1";
const today = new Date().toISOString().slice(0, 10);

async function submitClaim(
  page: Page,
  opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string },
) {
  await page.goto("/submit");
  // getByRole('button', ...) would also match My Claims' <tr role="button">
  // rows once a claim's category text happens to contain "Sports"/"Learning" —
  // scope to real <button> tags to hit only the category picker.
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Auto-approved").or(page.getByText("Routed to HR Head")).first()).toBeVisible();
}

/** Deletes every claim on /submit's My Claims list (they're all still pending_hr in these tests). */
async function deleteAllMyClaims(page: Page) {
  await page.goto("/submit");
  const rows = page.locator("table tbody tr");
  while ((await rows.count()) > 0) {
    await rows.first().click();
    await page.getByRole("button", { name: "Delete claim" }).click();
    await page.getByRole("button", { name: "Yes, delete claim" }).click();
    await expect(page.getByText("Claim deleted")).toBeVisible();
    // The modal's own close (onClose) races with the next loop iteration's
    // row click — wait for its overlay to actually leave the DOM first.
    await expect(page.getByRole("dialog", { name: "Claim detail" })).toHaveCount(0);
  }
}

test("a no-receipt claim fails verification, reserves the balance, and can be deleted while pending", async ({ page }) => {
  await signup(page, { name: "Priya Bose", email: uniqueEmail("expense-basic"), password: PASSWORD });

  await submitClaim(page, { category: "Sports", amountRupees: 1200, vendor: "Cult Fit Gym" });
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending HR Approval")).toBeVisible();
  await expect(page.getByText("No document uploaded")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("₹13,800")).toBeVisible(); // ₹15,000 cap − ₹1,200 reserved

  await deleteAllMyClaims(page);
  await page.goto("/dashboard");
  await expect(page.getByText("₹15,000").first()).toBeVisible(); // fully released
});

test("a claim exceeding the category cap is flagged and blocked from auto-approval", async ({ page }) => {
  await signup(page, { name: "Karan Shah", email: uniqueEmail("expense-overcap"), password: PASSWORD });

  await submitClaim(page, { category: "Learning", amountRupees: 50_000, vendor: "Advanced ML Course" });
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();
  await expect(page.getByText("Exceeds remaining balance")).toBeVisible();

  await deleteAllMyClaims(page);
});

test("submitting the same category+amount+date claim twice is flagged as a duplicate", async ({ page }) => {
  await signup(page, { name: "Meera Iyer", email: uniqueEmail("expense-dupe"), password: PASSWORD });

  await submitClaim(page, { category: "Sports", amountRupees: 800, vendor: "Decathlon Gear" });
  await expect(page.getByText("No prior match")).toBeVisible();

  await submitClaim(page, { category: "Sports", amountRupees: 800, vendor: "Decathlon Gear" });
  await expect(page.getByText("Matches a prior upload hash")).toBeVisible();

  await deleteAllMyClaims(page);
});

test("HR Head approving a pending claim moves it from Reserved to Used and into decided history", async ({ page }) => {
  const applicantName = uniqueName("Divya Menon");
  await signup(page, { name: applicantName, email: uniqueEmail("expense-approve"), password: PASSWORD });
  await submitClaim(page, { category: "Learning", amountRupees: 2000, vendor: "Coursera Plan" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

  await page.goto("/expenses");
  const row = page.locator("table tbody tr", { hasText: applicantName });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("₹2,000").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve ₹2,000" }).click();
  await expect(page.getByText("Approved ₹2,000 — employee notified")).toBeVisible();

  await page.goto("/expenses/history");
  await expect(page.locator("table tbody tr", { hasText: applicantName }).getByText("Approved", { exact: true })).toBeVisible();
});

test("HR Head rejecting a claim requires a reason and fully releases the reserved balance", async ({ page }) => {
  const applicantName = uniqueName("Ishaan Kapoor");
  const applicantEmail = uniqueEmail("expense-reject");
  await signup(page, { name: applicantName, email: applicantEmail, password: PASSWORD });
  await submitClaim(page, { category: "Sports", amountRupees: 1000, vendor: "Yoga Studio" });
  await page.goto("/dashboard");
  await expect(page.getByText("₹14,000")).toBeVisible(); // reserved

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

  await page.goto("/expenses");
  const row = page.locator("table tbody tr", { hasText: applicantName });
  await row.getByRole("button", { name: "Review" }).click();

  // Rejecting without a reason is blocked client-side — the drawer stays open.
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Add a reason the employee will see")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

  await page.getByPlaceholder("Add a reason the employee will see…").fill("Receipt not provided");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Claim rejected — balance released, employee notified")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: applicantEmail, password: PASSWORD });
  await page.goto("/dashboard");
  await expect(page.getByText("₹15,000").first()).toBeVisible(); // fully released
});
