// KAN-146 (Wallet Transaction History) — the "Ledger" tab on /submit: FY
// allocation credits always present for a brand-new employee, a claim under
// HR review shows up as a "Reserved" hold, category/type filtering narrows
// the table, "Clear filters" restores it, and a row's detail drawer opens
// with the linked-claim note. Every claim here is submitted WITHOUT a
// receipt file (mirrors submit-expense.spec.ts) so it deterministically
// lands in pending_hr — a real DB-backed "reserved" ledger row — rather than
// depending on OCR/ANTHROPIC_API_KEY being configured in this environment.
import { test, expect, type Page } from "@playwright/test";
import { signup, uniqueEmail } from "./utils/auth-ui";

const PASSWORD = "Ledger-Pass1";
const today = new Date().toISOString().slice(0, 10);

async function submitClaim(page: Page, opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string }) {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Auto-approved").or(page.getByText("Routed to HR Head")).first()).toBeVisible();
}

async function openLedgerTab(page: Page) {
  await page.goto("/submit");
  // Scoped to the view-switch tablist — the submit form above also has its
  // own category tabs, so an unscoped role lookup by name alone isn't safe.
  await page.getByRole("tablist", { name: "My claims view" }).getByRole("tab", { name: "Ledger" }).click();
  await expect(page.getByRole("heading", { name: "Wallet ledger" })).toBeVisible();
}

/** The ledger's own Benefit/Type filter tablists — scoped so "Learning"/"Reserved" etc. never clash with the submit form's category tabs above. */
function benefitFilter(page: Page) {
  return page.getByRole("tablist", { name: "Filter by benefit" });
}
function typeFilter(page: Page) {
  return page.getByRole("tablist", { name: "Filter by type" });
}

test("Ledger tab shows FY allocation credits, a pending claim's hold, category/type filters, and the detail drawer", async ({ page }) => {
  await signup(page, { name: "Ledger Tester", email: uniqueEmail("wallet-ledger"), password: PASSWORD });

  // A brand-new employee already has both categories' FY allocation credits —
  // synthesized, never a stored row.
  await openLedgerTab(page);
  await expect(page.getByText("Annual benefit allocation")).toHaveCount(2);
  await expect(page.getByText("Wallet balance")).toBeVisible();
  await expect(page.getByText("₹60,000").first()).toBeVisible(); // ₹15,000 + ₹45,000, nothing spent yet

  // Submit a no-receipt claim — it fails verification and lands in pending_hr,
  // which the ledger represents as a "Reserved" hold on the wallet.
  await submitClaim(page, { category: "Sports", amountRupees: 1200, vendor: "Cult Fit Gym" });

  await openLedgerTab(page);
  const reservedRow = page.locator("table tbody tr", { hasText: "Cult Fit Gym" });
  await expect(reservedRow).toBeVisible();
  await expect(reservedRow.getByText("Reserved", { exact: true })).toBeVisible();
  await expect(page.getByText("₹1,200").first()).toBeVisible(); // the "Reserved" stat tile

  // Filter to Learning only — the Sports claim's row (and its allocation
  // credit) drop out, leaving just the Learning allocation credit.
  await benefitFilter(page).getByRole("tab", { name: "Learning" }).click();
  await expect(page.getByText("Cult Fit Gym")).toHaveCount(0);
  await expect(page.getByText("Annual benefit allocation")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Annual benefit allocation")).toHaveCount(2);

  // Type filter: "Reserved" isolates just the pending hold.
  await typeFilter(page).getByRole("tab", { name: "Reserved" }).click();
  await expect(page.getByText("Annual benefit allocation")).toHaveCount(0);
  await expect(reservedRow).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  // A search with no matches hits the empty-filtered state, not "No claims yet".
  await page.getByPlaceholder("Search description or ref…").fill("no-such-transaction-zzz");
  await expect(page.getByText("No matching transactions")).toBeVisible();
  await expect(page.getByText("Try changing the filters above.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  // Clicking a row opens the right-side detail drawer with the claim-linked note.
  await reservedRow.click();
  const drawer = page.getByRole("dialog", { name: "Transaction detail" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("Balance after", { exact: false })).toBeVisible();
  await expect(drawer.getByText(/Linked to expense claim BC-.* · receipt on file\./)).toBeVisible();
});
