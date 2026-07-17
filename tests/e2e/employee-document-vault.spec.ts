// KAN-224 — Employee Document Vault. Acts through the UI as a freshly signed-up
// Employee. Covers:
//   AC1 — documents upload and download successfully.
//   AC2 — expiry reminders work (a near-expiry doc surfaces the in-app reminder),
//         and documents are user-specific (a stranger can't see them).
// plus replace/delete and an invalid-type negative path. Needs the private
// `employee-docs` bucket reachable — skips gracefully if Storage is unavailable.
import { test, expect, type Page } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { ensureEmployeeDocsBucket } from "./utils/fixtures";

const PASSWORD = "Pass-1234";
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% e2e stub\n") });

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function uploadDoc(page: Page, opts: { file: { name: string; mimeType: string; buffer: Buffer }; category?: string; expiry?: string }) {
  await page.locator("#doc-file").setInputFiles(opts.file);
  if (opts.category) await page.locator("#doc-category").selectOption(opts.category);
  if (opts.expiry) await page.locator("#doc-expiry").fill(opts.expiry);
  await page.getByRole("button", { name: /Upload document/ }).click();
}

let storageReady = false;
test.beforeAll(async () => {
  storageReady = await ensureEmployeeDocsBucket();
});
test.beforeEach(() => {
  test.skip(!storageReady, "Supabase Storage unreachable — the document vault needs the Storage endpoint reachable.");
});

test("upload surfaces the document, its near-expiry reminder, and downloads it (AC1, AC2)", async ({ page }) => {
  await signup(page, { name: uniqueName("Vault Owner"), email: uniqueEmail("vault-owner"), password: PASSWORD });
  await page.goto("/documents");
  await expect(page.getByText("Upload your first document to get started.")).toBeVisible();

  const fileName = `passport-${Math.floor(Math.random() * 1e6)}.pdf`;
  await uploadDoc(page, { file: pdf(fileName), category: "identity", expiry: isoInDays(10) });

  await expect(page.getByText("Document uploaded.")).toBeVisible();
  await expect(page.getByText(fileName).first()).toBeVisible();

  // AC2 — a document expiring within 30 days trips the in-app reminder.
  await expect(page.getByText("1 document needs attention")).toBeVisible();
  await expect(page.getByText(/Expires in \d+d/)).toBeVisible();

  // AC1 — download opens the signed URL in a new tab.
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Download" }).first().click(),
  ]);
  expect(popup).toBeTruthy();
});

test("a document can be replaced and deleted", async ({ page }) => {
  await signup(page, { name: uniqueName("Vault Editor"), email: uniqueEmail("vault-editor"), password: PASSWORD });
  await page.goto("/documents");

  const original = `contract-${Math.floor(Math.random() * 1e6)}.pdf`;
  const replacement = `contract-signed-${Math.floor(Math.random() * 1e6)}.pdf`;
  await uploadDoc(page, { file: pdf(original), category: "employment" });
  await expect(page.getByText(original).first()).toBeVisible();

  // Replace uses a hidden file input triggered by the row's button.
  await Promise.all([
    page.waitForEvent("filechooser").then((fc) => fc.setFiles(pdf(replacement))),
    page.getByRole("button", { name: `Replace ${original}` }).click(),
  ]);
  await expect(page.getByText("Document replaced.")).toBeVisible();
  await expect(page.getByText(replacement).first()).toBeVisible();
  await expect(page.getByText(original)).toHaveCount(0);

  // Delete (accept the confirm dialog).
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Delete ${replacement}` }).click();
  await expect(page.getByText("Document deleted.")).toBeVisible();
  await expect(page.getByText("Upload your first document to get started.")).toBeVisible();
});

test("an unsupported file type is rejected (negative)", async ({ page }) => {
  await signup(page, { name: uniqueName("Vault Reject"), email: uniqueEmail("vault-reject"), password: PASSWORD });
  await page.goto("/documents");

  await page.locator("#doc-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a document") });
  await page.getByRole("button", { name: /Upload document/ }).click();

  await expect(page.getByText("Unsupported file type — upload a PDF, JPG, or PNG.")).toBeVisible();
  await expect(page.getByText("Upload your first document to get started.")).toBeVisible();
});

test("documents are private to their owner (AC2)", async ({ page }) => {
  const secret = `salary-slip-${Math.floor(Math.random() * 1e6)}.pdf`;
  await signup(page, { name: uniqueName("Vault A"), email: uniqueEmail("vault-a"), password: PASSWORD });
  await page.goto("/documents");
  await uploadDoc(page, { file: pdf(secret), category: "financial" });
  await expect(page.getByText(secret).first()).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await signup(page, { name: uniqueName("Vault B"), email: uniqueEmail("vault-b"), password: PASSWORD });
  await page.goto("/documents");
  await expect(page.getByText("Upload your first document to get started.")).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
});
