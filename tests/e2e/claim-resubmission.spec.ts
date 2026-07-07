// KAN-126 (Claim Resubmission) — editing and resubmitting a `rejected` claim
// under the SAME claim id, with a version snapshot HR can compare (AC1-AC4).
// Every claim here uploads a real receipt file (never the no-file path) so a
// "Run verification & submit" click never trips the client-side "supporting
// document required" guard for reasons unrelated to this story — same
// convention as expense-upload.spec.ts / receipt-intelligence.spec.ts. No
// ANTHROPIC_API_KEY in this environment, so OCR degrades to zero confidence
// and every claim here deterministically routes to HR, never auto-approves.
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { login, logout, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, ensureReceiptsBucket } from "./utils/fixtures";
import { testDb, schema } from "./utils/db";

const PASSWORD = "Resubmit-Pass1";
const today = new Date().toISOString().slice(0, 10);

const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const receiptBytes = () => Buffer.from(PNG_1PX_BASE64, "base64");

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

async function submitPendingClaim(
  page: Page,
  opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string; fileName?: string },
) {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.locator("input[type='file']").setInputFiles({
    name: opts.fileName ?? "receipt.png",
    mimeType: "image/png",
    buffer: receiptBytes(),
  });
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();
}

/** As HR: reject the first queue row matching this applicant, then sign out. */
async function rejectFirstQueueRow(page: Page, applicantName: string, reason: string) {
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto("/expenses");
  const row = page.locator("table tbody tr", { hasText: applicantName });
  await row.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByPlaceholder("Add a reason the employee will see…").fill(reason);
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Claim rejected — balance released, employee notified")).toBeVisible();
  await logout(page);
}

async function claimIdFor(applicantName: string): Promise<string> {
  const db = testDb();
  const rows = await db
    .select({ id: schema.benefitClaims.id })
    .from(schema.benefitClaims)
    .innerJoin(schema.users, eq(schema.benefitClaims.userId, schema.users.id))
    .where(eq(schema.users.name, applicantName));
  if (!rows[0]) throw new Error(`No claim found for ${applicantName}`);
  return rows[0].id;
}

test("editing and resubmitting a rejected claim keeps the same claim id, re-enters verification, and shows a v2 badge", async ({ page }) => {
  const applicantName = uniqueName("Zoya Ahmed");
  const applicantEmail = uniqueEmail("resubmit-basic");
  await signup(page, { name: applicantName, email: applicantEmail, password: PASSWORD });
  await submitPendingClaim(page, { category: "Sports", amountRupees: 1200, vendor: "Cult Fit Gym", fileName: "receipt-v1.png" });
  const claimId = await claimIdFor(applicantName);
  await logout(page);

  await rejectFirstQueueRow(page, applicantName, "Receipt illegible — please reattach.");

  await login(page, { email: applicantEmail, password: PASSWORD });
  await page.goto("/submit");

  // AC1 — only a rejected claim can be resubmitted; same claim id throughout.
  const row = page.locator("table tbody tr", { hasText: "Rejected" }).first();
  await row.click();
  await page.getByRole("link", { name: "Edit & resubmit" }).click();
  await expect(page).toHaveURL(new RegExp(`resubmit=${claimId}`));
  await expect(page.getByRole("heading", { name: "Edit & resubmit claim" })).toBeVisible();
  await expect(page.getByText(`Resubmitting claim ${claimId.slice(0, 8)}`)).toBeVisible();
  await expect(page.locator("input[inputmode='numeric']")).toHaveValue("1200");

  // AC2/AC3 — change the flagged fields, replace the receipt, re-verify.
  await page.locator("input[inputmode='numeric']").fill("1350");
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill("Cult Fit Gym — corrected");
  await page.locator("input[type='file']").setInputFiles({
    name: "receipt-v2.png",
    mimeType: "image/png",
    buffer: receiptBytes(),
  });
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Resubmitted — routed to HR Head for manual review")).toBeVisible();

  await page.goto("/submit");
  await expect(page.getByText("Rejected", { exact: true })).toHaveCount(0); // no longer rejected
  await expect(page.getByText("v2")).toBeVisible(); // AC1 — same row, now versioned
});

test("HR can compare the prior and current version after a resubmission", async ({ page }) => {
  const applicantName = uniqueName("Kabir Nanda");
  const applicantEmail = uniqueEmail("resubmit-compare");
  await signup(page, { name: applicantName, email: applicantEmail, password: PASSWORD });
  await submitPendingClaim(page, { category: "Learning", amountRupees: 5000, vendor: "Udemy course", fileName: "receipt-a.png" });
  const claimId = await claimIdFor(applicantName);
  await logout(page);

  await rejectFirstQueueRow(page, applicantName, "Amount doesn't match the receipt.");

  await login(page, { email: applicantEmail, password: PASSWORD });
  await page.goto(`/submit?resubmit=${claimId}`);
  await page.locator("input[inputmode='numeric']").fill("4800");
  await page.locator("input[type='file']").setInputFiles({
    name: "receipt-b.png",
    mimeType: "image/png",
    buffer: receiptBytes(),
  });
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Resubmitted — routed to HR Head for manual review")).toBeVisible();
  await logout(page);

  // AC4 — HR sees both versions side by side.
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto(`/expenses/${claimId}/intelligence`);
  await expect(page.getByText("Resubmission · compare versions")).toBeVisible();
  await expect(page.getByText("1 prior version")).toBeVisible();
  // "₹5,000" also appears in the audit trail entry for the original submission —
  // scope to the version-compare table's own cell to avoid the strict-mode clash.
  await expect(page.getByRole("cell", { name: "₹5,000" })).toBeVisible(); // v1 amount
  await expect(page.getByText("₹4,800").first()).toBeVisible(); // v2 (current) amount
});
