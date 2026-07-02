// KAN-78: HR department-wide availability overview. The screen lives at
// /departments and is gated the same way as the other HR-only screens
// (/settings/staffing-thresholds KAN-74, /reports KAN-44) — via
// MODULE_ACCESS/requireAccess, so a disallowed role is bounced to their own
// home route.
//
// Business rules under test: HR Head sees every department's headcount and
// today's (a fixed, test-controlled workday's) % available, and drilling into
// a department means clicking through to the Team Lead/Project Manager it
// contains — reusing the existing per-manager heatmap (KAN-75/76) via
// ?team=<id> rather than a new department-scoped view.
import { test, expect } from "@playwright/test";
import { login, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, setUserDepartment } from "./utils/fixtures";
import { makeTeamLead, makeReport } from "./utils/team";
import { pickWorkday } from "./utils/dates";

const PASSWORD = "Dept-Pass1";

test.describe("Department availability overview — HR Head/Admin only", () => {
  test("HR Head sees a department's capacity and can drill into its manager's heatmap", async ({ page }) => {
    const dept = uniqueName("KAN78 Dept");
    const workday = pickWorkday(3);

    const tl = await makeTeamLead(page, "KAN78 Dept TL", PASSWORD);
    await setUserDepartment(tl.email, dept);
    await makeReport(page, "KAN78 Dept Emp One", { teamLeadId: tl.id, password: PASSWORD, department: dept });
    await makeReport(page, "KAN78 Dept Emp Two", { teamLeadId: tl.id, password: PASSWORD, department: dept });

    await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Departments" })).toBeVisible();
    await nav.getByRole("link", { name: "Departments" }).click();
    await expect(page).toHaveURL(/\/departments$/);
    await expect(page.getByRole("heading", { name: "Department availability" })).toBeVisible();

    // Pin the date to a guaranteed workday so the assertion is deterministic
    // regardless of what day the suite actually runs on.
    await page.goto(`/departments?date=${workday}`);

    const row = page.locator("tr", { hasText: dept });
    await expect(row).toBeVisible();
    // TL + 2 reports, all in `dept`, none with any leave -> full headcount available.
    await expect(row).toContainText("100%");
    await expect(row).toContainText("3/3 available");
    await expect(row).toContainText("OK");

    await row.getByRole("link", { name: `${tl.name} heatmap →` }).click();
    await expect(page).toHaveURL(new RegExp(`/availability\\?team=${tl.id}`));
    await expect(page.getByText(`Capacity & coverage for ${tl.name}`, { exact: false })).toBeVisible();
    // The heatmap counts direct reports only (TL A's 2 employees) — the
    // department overview's headcount of 3 also includes the TL themself.
    await expect(page.getByText("2 direct reports")).toBeVisible();
  });

  test("Employee cannot access the departments screen", async ({ page }) => {
    await signup(page, { name: "Nav Blocked Employee KAN78", email: uniqueEmail("dept-emp"), password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.locator("nav").getByRole("link", { name: "Departments" })).toHaveCount(0);

    await page.goto("/departments");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("Team Lead cannot access the departments screen", async ({ page }) => {
    await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
    await expect(page).toHaveURL(/\/approvals$/);

    await expect(page.locator("nav").getByRole("link", { name: "Departments" })).toHaveCount(0);

    await page.goto("/departments");
    await expect(page).toHaveURL(/\/approvals$/);
  });

  test("Project Manager cannot access the departments screen", async ({ page }) => {
    await login(page, { email: FIXED_USERS.projectManager.email, password: TEST_PASSWORD });
    await expect(page).toHaveURL(/\/approvals$/);

    await expect(page.locator("nav").getByRole("link", { name: "Departments" })).toHaveCount(0);

    await page.goto("/departments");
    await expect(page).toHaveURL(/\/approvals$/);
  });
});
