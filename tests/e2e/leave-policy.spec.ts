// KAN-187 (Leave Policy Viewer) — HR Head edits a leave type's content at
// /settings/leave-policy, an employee sees it on /leave-policy with a working
// FAQ accordion, HR uploads the policy PDF and the employee can download it
// via a fresh signed URL, and a non-HR role is bounced from the settings screen.
import { test, expect } from "@playwright/test";
import { login, logout, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, ensurePolicyDocsBucket } from "./utils/fixtures";

let storageReady = false;
test.beforeAll(async () => {
  storageReady = await ensurePolicyDocsBucket();
});

test("HR Head edits Casual Leave content, and an employee sees it with a working FAQ accordion", async ({ page }) => {
  // Chains an HR login + several saves + an employee signup — each a real
  // Supabase round trip, so give it more headroom than the global 90s default.
  test.setTimeout(150_000);
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

  const nav = page.locator("nav");
  await expect(nav.getByRole("link", { name: "Leave policy content" })).toBeVisible();
  await nav.getByRole("link", { name: "Leave policy content" }).click();
  await expect(page).toHaveURL(/\/settings\/leave-policy$/);
  await expect(page.getByRole("heading", { name: "Leave policy content" })).toBeVisible();

  await page.getByRole("tablist", { name: "Select leave type" }).getByRole("tab", { name: "Casual Leave" }).click();

  const uniqueSummary = uniqueName("CL summary edited by e2e");
  const summaryInput = page.locator("#summary");
  await summaryInput.fill(uniqueSummary);

  const faqQuestion = uniqueName("Can I do the e2e FAQ thing?");
  const faqAnswer = "Yes, this is the e2e-authored answer.";
  await page.getByRole("button", { name: "Add FAQ" }).click();
  await page.getByPlaceholder("Question").last().fill(faqQuestion);
  await page.getByPlaceholder("Answer").last().fill(faqAnswer);

  await page.getByRole("button", { name: "Save CL content" }).click();
  await expect(page.getByText("Policy content saved.")).toBeVisible();

  // Employee-facing viewer reflects the edit immediately (revalidatePath).
  // /login redirects an already-authenticated session straight to its home
  // route, so the HR session must sign out before the next actor can sign up.
  await logout(page);
  await signup(page, { name: "Policy Viewer Tester", email: uniqueEmail("leave-policy"), password: "Policy-Pass1" });
  await expect(page.locator("nav").getByRole("link", { name: "Leave policies" })).toBeVisible();
  await page.goto("/leave-policy");
  await expect(page.getByRole("heading", { name: "Leave policies" })).toBeVisible();

  await page.getByText("Casual Leave").first().click();
  await expect(page.getByText(uniqueSummary)).toBeVisible();
  await expect(page.getByText("Carry-forward")).toBeVisible();

  const faqButton = page.getByRole("button", { name: faqQuestion });
  await expect(faqButton).toBeVisible();
  await expect(page.getByText(faqAnswer)).toHaveCount(0);
  await faqButton.click();
  await expect(page.getByText(faqAnswer)).toBeVisible();
  await faqButton.click();
  await expect(page.getByText(faqAnswer)).toHaveCount(0);
});

test("HR Head uploads the policy PDF and an employee can download it", async ({ page }) => {
  test.skip(!storageReady, "Supabase Storage unreachable in this environment.");
  test.setTimeout(150_000);

  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto("/settings/leave-policy");
  await page.locator("input[type='file']").setInputFiles({
    name: "leave-policy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e test policy document"),
  });
  await page.getByRole("button", { name: /Upload PDF|Replace PDF/ }).click();
  await expect(page.getByText("Policy document updated.")).toBeVisible();

  await logout(page);
  await signup(page, { name: "Policy Download Tester", email: uniqueEmail("leave-policy-pdf"), password: "Policy-Pass1" });
  await page.goto("/leave-policy");
  await page.getByText("Casual Leave").first().click();

  // A popup only opens when getLeavePolicyDocumentUrlAction returned a truthy
  // signed URL (the client shows a "no document" toast instead otherwise) —
  // that's the behavior under test. Headless Chromium hands the PDF response
  // to its download manager rather than rendering it, so the popup's own
  // page.url() is unreliable here; asserting the popup itself opened is the
  // robust cross-environment signal.
  await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
});

test("Employee cannot access the leave-policy settings screen", async ({ page }) => {
  await signup(page, { name: "Policy Settings Blocked", email: uniqueEmail("leave-policy-blocked"), password: "Policy-Pass1" });
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.locator("nav").getByRole("link", { name: "Leave policy content" })).toHaveCount(0);

  await page.goto("/settings/leave-policy");
  await expect(page).toHaveURL(/\/dashboard$/);
});
