// KAN-113 (epic KAN-110) — surfaces the explainable AI score/verdict (KAN-111)
// directly in the HR expense queue and review drawer, with a link through to
// the full Receipt Intelligence screen (KAN-112), instead of requiring HR to
// navigate there first to see it.
//
// Same fixture shape as receipt-intelligence.spec.ts: a real uploaded receipt,
// no ANTHROPIC_API_KEY in this environment so OCR degrades to zero confidence.
// Only "Amount matches receipt" and "OCR confidence" fail — everything else
// passes — which is a deterministic score of 70/100, verdict "review".
import { test, expect, type Page } from "@playwright/test";
import { login, logout, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, ensureReceiptsBucket } from "./utils/fixtures";

const PASSWORD = "QueueScore-Pass1";
const today = new Date().toISOString().slice(0, 10);

const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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

async function submitPendingClaim(page: Page, opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string }) {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.locator("input[type='file']").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX_BASE64, "base64"),
  });
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();
}

test("the HR queue row shows the AI score and links to the full analysis", async ({ page }) => {
  const applicantName = uniqueName("Ishita Bhatt");
  await signup(page, { name: applicantName, email: uniqueEmail("queue-score"), password: PASSWORD });
  await submitPendingClaim(page, { category: "Sports", amountRupees: 1500, vendor: "Cult Fit" });
  await logout(page);

  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto("/expenses");
  const row = page.locator("table tbody tr", { hasText: applicantName });
  await expect(row.getByText("70")).toBeVisible();
  await expect(row.getByRole("link", { name: "Analyze" })).toBeVisible();

  await row.getByRole("link", { name: "Analyze" }).click();
  await expect(page.getByRole("heading", { name: "Receipt intelligence" })).toBeVisible();
  await expect(page.getByText("Needs human review").first()).toBeVisible();
});

test("the review drawer shows the AI score with a link to the full analysis", async ({ page }) => {
  const applicantName = uniqueName("Vivaan Chatterjee");
  await signup(page, { name: applicantName, email: uniqueEmail("drawer-score"), password: PASSWORD });
  await submitPendingClaim(page, { category: "Learning", amountRupees: 3000, vendor: "Coursera" });
  await logout(page);

  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto("/expenses");
  const row = page.locator("table tbody tr", { hasText: applicantName });
  await row.getByRole("button", { name: "Review" }).click();

  const drawer = page.getByRole("dialog", { name: `Review claim for ${applicantName}` });
  await expect(drawer.getByText("70")).toBeVisible();
  await expect(drawer.getByText("AI recommendation")).toBeVisible();

  await drawer.getByRole("link", { name: "Full analysis →" }).click();
  await expect(page.getByRole("heading", { name: "Receipt intelligence" })).toBeVisible();
});
