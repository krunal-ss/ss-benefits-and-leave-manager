// KAN-74: staffing threshold configuration (HR Head / Admin only). The screen
// lives at /settings/staffing-thresholds and is gated the same way as the
// other HR-only settings screen (/settings/approvals, KAN-46) — via
// MODULE_ACCESS/requireAccess, so a disallowed role is bounced to their own
// home route (see rbac-nav.spec.ts for the sibling pattern this mirrors).
import { test, expect } from "@playwright/test";
import { login, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";

test.describe("Staffing thresholds — HR Head config screen", () => {
  test("HR Head can set the org-wide default and create + edit a department override", async ({ page }) => {
    await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Staffing thresholds" })).toBeVisible();
    await nav.getByRole("link", { name: "Staffing thresholds" }).click();
    await expect(page).toHaveURL(/\/settings\/staffing-thresholds$/);
    await expect(page.getByRole("heading", { name: "Staffing thresholds" })).toBeVisible();

    // ---- org-wide default: edit in place ----
    // Scope to the smallest div containing both the title and description text —
    // the Card wrapping this section (Tailwind divs have no distinguishing role).
    const orgCard = page
      .locator("div")
      .filter({ hasText: "Org-wide default" })
      .filter({ hasText: "Applies to every department" })
      .last();
    await orgCard.getByRole("button", { name: /Edit default|Set default/ }).click();
    await page.getByLabel("Min available %").fill("62");
    await page.getByRole("button", { name: "Save default" }).click();
    await expect(page.getByText("Org-wide default threshold saved.")).toBeVisible();
    await expect(orgCard.getByText("62%")).toBeVisible();

    // ---- department override: create ----
    const dept = uniqueName("QA Dept KAN74");
    await page.getByRole("button", { name: "New override" }).click();
    await page.getByLabel("Department").fill(dept);
    await page.getByLabel("Min available %").fill("40");
    await page.getByRole("button", { name: "Save override" }).click();
    await expect(page.getByText(`Threshold saved for "${dept}".`)).toBeVisible();

    const row = page.locator("tr", { hasText: dept });
    await expect(row).toContainText("40%");

    // ---- department override: edit ----
    await row.getByRole("button", { name: `Edit ${dept}` }).click();
    await page.getByLabel("Min available %").fill("55");
    await page.getByRole("button", { name: "Save override" }).click();
    await expect(page.getByText(`Threshold saved for "${dept}".`)).toBeVisible();
    await expect(row).toContainText("55%");
    await expect(row).not.toContainText("40%");
  });

  test("Employee cannot access the staffing-thresholds screen", async ({ page }) => {
    await signup(page, { name: "Nav Blocked Employee", email: uniqueEmail("staffing-emp"), password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.locator("nav").getByRole("link", { name: "Staffing thresholds" })).toHaveCount(0);

    await page.goto("/settings/staffing-thresholds");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Team Lead cannot access the staffing-thresholds screen", async ({ page }) => {
    await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
    await expect(page).toHaveURL(/\/approvals$/);

    await expect(page.locator("nav").getByRole("link", { name: "Staffing thresholds" })).toHaveCount(0);

    await page.goto("/settings/staffing-thresholds");
    await expect(page).toHaveURL(/\/approvals$/);
  });

  test("Project Manager cannot access the staffing-thresholds screen", async ({ page }) => {
    await login(page, { email: FIXED_USERS.projectManager.email, password: TEST_PASSWORD });
    await expect(page).toHaveURL(/\/approvals$/);

    await expect(page.locator("nav").getByRole("link", { name: "Staffing thresholds" })).toHaveCount(0);

    await page.goto("/settings/staffing-thresholds");
    await expect(page).toHaveURL(/\/approvals$/);
  });
});
