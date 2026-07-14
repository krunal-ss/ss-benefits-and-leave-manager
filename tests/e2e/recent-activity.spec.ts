// KAN-186 (Recent Activities Widget) — a brand-new employee already has two
// synthesized wallet-credit events (the FY allocations, same as the wallet
// ledger). Submitting a claim adds one more event; the type/status filters
// narrow the list and "Clear filters" restores it. A real receipt file is
// attached (see expense-upload.spec.ts) — /submit's client-side validation
// requires a supporting document before it will submit at all.
import { test, expect, type Page } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { ensureReceiptsBucket } from "./utils/fixtures";

const today = new Date().toISOString().slice(0, 10);
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const receiptBytes = () => Buffer.from(PNG_1PX_BASE64, "base64");

async function submitClaim(page: Page, opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string }) {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.locator("input[type='file']").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: receiptBytes() });
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Auto-approved").or(page.getByText("Routed to HR Head")).first()).toBeVisible();
}

let storageReady = false;
test.beforeAll(async () => {
  storageReady = await ensureReceiptsBucket();
});

test("Recent activity shows FY wallet credits, a submitted claim, and the type/status filters", async ({ page }) => {
  test.skip(!storageReady, "Supabase Storage unreachable in this environment.");
  await signup(page, { name: "Activity Tester", email: uniqueEmail("recent-activity"), password: "Activity-Pass1" });

  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.getByText("Wallet credited · Sports allocation")).toBeVisible();
  await expect(page.getByText("Wallet credited · Learning allocation")).toBeVisible();

  const vendor = uniqueName("ActivityVendor");
  await submitClaim(page, { category: "Sports", amountRupees: 1500, vendor });

  await page.goto("/activity");
  const claimRow = page.locator("div", { hasText: `${vendor} claim` }).last();
  await expect(claimRow).toBeVisible();

  // Type filter: "Claims" isolates the claim, wallet credits drop out.
  await page.getByRole("tablist", { name: "Filter by type" }).getByRole("tab", { name: "Claims" }).click();
  await expect(page.getByText("Wallet credited · Sports allocation")).toHaveCount(0);
  await expect(page.getByText(`${vendor} claim`)).toBeVisible();

  // Status filter: "Rejected" leaves nothing (the claim is pending or auto-approved, never rejected) — empty state + clear.
  await page.getByRole("tablist", { name: "Filter by status" }).getByRole("tab", { name: "Rejected" }).click();
  await expect(page.getByText("No activity matches these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText(`${vendor} claim`)).toBeVisible();
  await expect(page.getByText("Wallet credited · Sports allocation")).toBeVisible();
});

test("The dashboard shows a Recent activity preview linking to the full feed", async ({ page }) => {
  await signup(page, { name: "Dashboard Activity Tester", email: uniqueEmail("dash-activity"), password: "Activity-Pass1" });
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByText("Wallet credited · Sports allocation")).toBeVisible();
  await page.getByRole("link", { name: "View all" }).click();
  await expect(page).toHaveURL(/\/activity$/);
});
