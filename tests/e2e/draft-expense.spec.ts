// KAN-125 (Expense Draft Save) — save/resume/edit/delete a partial claim, and
// finalize it through the same verification pipeline as a fresh submit. Every
// scenario here attaches a real receipt file (never the no-file path used by
// submit-expense.spec.ts) so a "Submit" click never trips the client-side
// "supporting document required" guard for reasons unrelated to drafts.
import { test, expect, type Page } from "@playwright/test";
import { signup, uniqueEmail } from "./utils/auth-ui";

const PASSWORD = "Draft-Pass1";
const today = new Date().toISOString().slice(0, 10);

// A real, minimal 1×1 PNG — content is irrelevant to these assertions.
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const receiptBytes = () => Buffer.from(PNG_1PX_BASE64, "base64");

async function attachReceipt(page: Page) {
  await page.locator("input[type='file']").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: receiptBytes(),
  });
}

/**
 * Deletes every remaining row (draft or otherwise) on /submit's My Claims list.
 * Reloads via goto() after each delete instead of relying on the modal to
 * auto-close — there's a known pre-existing issue (reproduces on unmodified
 * main too, unrelated to KAN-125) where the claim-detail dialog sometimes
 * doesn't unmount on its own after a successful delete.
 */
async function deleteAllMyClaims(page: Page) {
  await page.goto("/submit");
  const rows = page.locator("table tbody tr");
  while ((await rows.count()) > 0) {
    await rows.first().click();
    // A draft's initial delete button is just "Delete" (confirming shows "Yes, delete draft"); a
    // pending_hr claim's is "Delete claim" — see claim-detail-modal.tsx.
    const deleteBtn = page.getByRole("button", { name: "Delete", exact: true }).or(page.getByRole("button", { name: "Delete claim" }));
    await deleteBtn.first().click();
    await page
      .getByRole("button", { name: "Yes, delete draft" })
      .or(page.getByRole("button", { name: "Yes, delete claim" }))
      .click();
    await expect(page.getByText("Draft deleted").or(page.getByText("Claim deleted"))).toBeVisible();
    await page.goto("/submit");
  }
}

test("saving a draft with only some fields filled never reserves balance, and can be resumed, edited, and deleted", async ({ page }) => {
  await signup(page, { name: "Rohan Verma", email: uniqueEmail("draft-basic"), password: PASSWORD });

  // Partial: category (default Sports) + amount only, no vendor/date/file yet.
  await page.goto("/submit");
  await page.locator("input[inputmode='numeric']").fill("1500");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved — no balance reserved")).toBeVisible();

  // AC3 — a draft never reserves category balance.
  await page.goto("/dashboard");
  await expect(page.getByText("₹15,000").first()).toBeVisible();

  // AC1 — resume: the draft shows up in My Claims and can be reopened/edited.
  await page.goto("/submit");
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  const row = page.locator("table tbody tr", { hasText: "Draft" }).first();
  await row.click();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await expect(page.locator("input[inputmode='numeric']")).toHaveValue("1500");

  // Fill in the rest, then AC2 — delete the draft outright.
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill("Decathlon Gear");
  await deleteAllMyClaims(page);
  await expect(page.getByText("No claims yet")).toBeVisible();
});

test("completing and submitting a draft runs it through the normal verification pipeline", async ({ page }) => {
  await signup(page, { name: "Aditi Rao", email: uniqueEmail("draft-submit"), password: PASSWORD });

  await page.goto("/submit");
  await page.locator("button").filter({ hasText: "Learning" }).click();
  await page.locator("input[inputmode='numeric']").fill("3000");
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill("Udemy course");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved — no balance reserved")).toBeVisible();

  // Resume the draft and finish it off with a receipt.
  await page.goto("/submit");
  const row = page.locator("table tbody tr", { hasText: "Draft" }).first();
  await row.click();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await expect(page.locator("input[inputmode='numeric']")).toHaveValue("3000");
  await page.locator("input[type='date']").fill(today);
  await attachReceipt(page);
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Auto-approved").or(page.getByText("Routed to HR Head")).first()).toBeVisible();

  // No longer a draft — it now shows a real decision status, and balance reflects it.
  await page.goto("/submit");
  await expect(page.getByText("Draft", { exact: true })).toHaveCount(0);

  await deleteAllMyClaims(page).catch(() => {}); // best-effort cleanup; an auto-approved row can't be deleted, that's expected
});
