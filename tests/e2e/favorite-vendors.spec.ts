// KAN-207 — Favorite Expense Vendors. Reuses expense-upload.spec.ts's real-file
// upload pattern (rather than submit-expense.spec.ts's no-receipt path, which
// the client blocks before it ever reaches the server — see fileMissing/submit
// gating in submit-form.tsx) so submission reliably finalizes and exercises
// verifyAndScoreClaim's usage-count hook.
import { test, expect, type Page } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { ensureReceiptsBucket } from "./utils/fixtures";

const today = new Date().toISOString().slice(0, 10);

const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const receiptBytes = () => Buffer.from(PNG_1PX_BASE64, "base64");

async function submitClaim(page: Page, opts: { vendor: string }) {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: "Sports" }).click();
  await page.locator("input[inputmode='numeric']").fill("500");
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
test.beforeEach(() => {
  test.skip(
    !storageReady,
    "Supabase Storage unreachable in this environment — receipt upload needs the Storage endpoint reachable from the app + test runner.",
  );
});

test("a finalized claim's vendor becomes a suggested chip, and clicking it fills the vendor field", async ({ page }) => {
  const vendor = `Cult Fit Gym ${Math.floor(Math.random() * 1e6)}`;
  await signup(page, { name: uniqueName("Vendor Suggest Employee"), email: uniqueEmail("vendor-suggest"), password: "Pass-1234" });

  await submitClaim(page, { vendor });

  await page.goto("/submit");
  await expect(page.getByText("Frequently used:")).toBeVisible();
  // exact: true — otherwise this also matches the My Claims row for the same
  // claim, whose <tr role="button"> accessible name contains the vendor text too.
  const chip = page.getByRole("button", { name: vendor, exact: true });
  await expect(chip).toBeVisible();

  const vendorInput = page.getByPlaceholder("e.g. Cult.fit annual membership");
  await vendorInput.fill("");
  await chip.click();
  await expect(vendorInput).toHaveValue(vendor);
});

test("pinning a vendor persists across reloads, and favorites are user-specific", async ({ page }) => {
  const vendor = `Only Employee A Vendor ${Math.floor(Math.random() * 1e6)}`;
  await signup(page, { name: uniqueName("Vendor Owner"), email: uniqueEmail("vendor-owner"), password: "Pass-1234" });
  await submitClaim(page, { vendor });

  await page.goto("/submit");
  const pinButton = page.getByRole("button", { name: `Pin ${vendor}` });
  await expect(pinButton).toBeVisible();
  await pinButton.click();
  await expect(page.getByRole("button", { name: `Unpin ${vendor}` })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: `Unpin ${vendor}` })).toHaveAttribute("aria-pressed", "true");

  // AC2 — a different employee never sees this vendor as a suggestion.
  await page.getByRole("button", { name: "Sign out" }).click();
  await signup(page, { name: uniqueName("Vendor Stranger"), email: uniqueEmail("vendor-stranger"), password: "Pass-1234" });
  await page.goto("/submit");
  await expect(page.getByText("Frequently used:")).toHaveCount(0);
  await expect(page.getByText(vendor)).toHaveCount(0);
});
