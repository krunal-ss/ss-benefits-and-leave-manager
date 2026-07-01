// KAN-52 (E2E upload + duplicate-block) — the receipt-file half of KAN-47's
// expense journey (KAN-41 storage + KAN-42 verification). This proves PRD §4.5
// AC2 through the REAL uploaded-file path, not the category+amount+date fallback
// that submit-expense.spec.ts exercises: an uploaded receipt is stored against
// the claim (the "File readable" rule sees "Document present"), and re-submitting
// the SAME file bytes — even with a different amount + date — is blocked as a
// duplicate purely by its SHA-256 content hash.
//
// Runtime prerequisites (same as the rest of this suite): a live Supabase project
// with SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL in .env.local. The private
// `receipts` bucket is created by ensureReceiptsBucket() in beforeAll.
// ANTHROPIC_API_KEY is deliberately NOT required: with no key the OCR pass
// degrades to zero confidence, so a claim WITH a valid uploaded receipt still
// routes to HR rather than auto-approving. That keeps these assertions
// deterministic (document present + hash dedup) and never depends on a flaky
// real-vision auto-approve.
import { test, expect, type Page } from "@playwright/test";
import { signup, uniqueEmail } from "./utils/auth-ui";
import { ensureReceiptsBucket } from "./utils/fixtures";

const PASSWORD = "Upload-Pass1";

// A real, minimal 1×1 PNG. Content is irrelevant to the assertions (the upload
// accepts any non-empty PDF/JPG/PNG and, absent an OCR key, extraction is a
// no-op) — what matters is that identical bytes hash identically for the dedup.
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const receiptBytes = () => Buffer.from(PNG_1PX_BASE64, "base64");

/** Fill the claim form, attach the given (or default) receipt file, and submit. */
async function uploadAndSubmit(
  page: Page,
  opts: {
    category: "Sports" | "Learning";
    amountRupees: number;
    date: string;
    vendor: string;
    fileName?: string;
  },
) {
  await page.goto("/submit");
  // Scope to a real <button> so we don't match a My Claims <tr role="button">.
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(opts.date);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  // The file input is hidden behind a styled dropzone — setInputFiles drives it directly.
  await page.locator("input[type='file']").setInputFiles({
    name: opts.fileName ?? "receipt.png",
    mimeType: "image/png",
    buffer: receiptBytes(),
  });
  // The picked-file chip ("… · ready to verify") confirms the client accepted the file.
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(
    page.getByText("Auto-approved").or(page.getByText("Routed to HR Head")).first(),
  ).toBeVisible();
}

/** Remove every claim on My Claims (all still pending_hr here) so repeat runs stay clean. */
async function deleteAllMyClaims(page: Page) {
  await page.goto("/submit");
  const rows = page.locator("table tbody tr");
  while ((await rows.count()) > 0) {
    await rows.first().click();
    await page.getByRole("button", { name: "Delete claim" }).click();
    await page.getByRole("button", { name: "Yes, delete claim" }).click();
    await expect(page.getByText("Claim deleted")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Claim detail" })).toHaveCount(0);
  }
}

test.beforeAll(async () => {
  await ensureReceiptsBucket();
});

test("an uploaded receipt is stored against the claim (File readable → Document present)", async ({ page }) => {
  await signup(page, { name: "Ananya Rao", email: uniqueEmail("upload-doc"), password: PASSWORD });

  await uploadAndSubmit(page, {
    category: "Sports",
    amountRupees: 900,
    date: "2026-06-20",
    vendor: "Decathlon Store",
  });

  // The receipt reached the private bucket → the "File readable" rule passes.
  await expect(page.getByText("Document present")).toBeVisible();
  // No OCR key in this env → verification is inconclusive → the claim routes to HR
  // (never a silent auto-approve), now proven with a real uploaded file present.
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();

  await deleteAllMyClaims(page);
});

test("re-submitting the same receipt file is blocked as a duplicate by its content hash (§4.5 AC2)", async ({ page }) => {
  await signup(page, { name: "Vikram Nair", email: uniqueEmail("upload-dupe"), password: PASSWORD });

  // First claim: this file's hash has never been seen → the duplicate rule passes.
  await uploadAndSubmit(page, {
    category: "Sports",
    amountRupees: 1100,
    date: "2026-06-10",
    vendor: "Gym Gear",
  });
  await expect(page.getByText("Document present")).toBeVisible();
  await expect(page.getByText("No prior match")).toBeVisible();

  // Second claim: DIFFERENT amount + date, so the category+amount+date fallback
  // cannot match — only the SAME file's SHA-256 links the two. Still flagged.
  await uploadAndSubmit(page, {
    category: "Sports",
    amountRupees: 2600,
    date: "2026-06-25",
    vendor: "Gym Gear",
  });
  await expect(page.getByText("Matches a prior upload hash")).toBeVisible();
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();

  await deleteAllMyClaims(page);
});
