// KAN-12: RBAC, role-scoped navigation & app shell. NAV_SECTIONS/canAccessPath
// in src/server/users.ts is the single access policy — check both the sidebar
// (convenience) and the server-side guard (the actual enforcement) per role.
import { test, expect } from "@playwright/test";
import { login, signup, uniqueEmail } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";

test.describe.configure({ mode: "parallel" });

test("Employee sees only the shared workspace nav, and is bounced out of manager/HR routes", async ({ page }) => {
  await signup(page, { name: "Employee Nav", email: uniqueEmail("nav-emp"), password: "Pass-1234" });
  await expect(page).toHaveURL(/\/dashboard$/);

  const nav = page.locator("nav");
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Submit expense" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Apply leave / WFH" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Expense queue" })).toHaveCount(0);
  await expect(page.getByText("Employee", { exact: true })).toBeVisible();

  await page.goto("/approvals");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/expenses");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Team Lead sees Manager nav (not HR), and is bounced out of the HR expense queue", async ({ page }) => {
  await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
  await expect(page).toHaveURL(/\/approvals$/); // homeRouteFor(team_lead)

  const nav = page.locator("nav");
  await expect(nav.getByRole("link", { name: "Approvals" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Team calendar" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Expense queue" })).toHaveCount(0);
  await expect(page.getByText("Team Lead", { exact: true })).toBeVisible();

  await page.goto("/expenses");
  await expect(page).toHaveURL(/\/approvals$/);
});

test("Project Manager sees Manager nav (not HR), and is bounced out of the HR expense queue", async ({ page }) => {
  await login(page, { email: FIXED_USERS.projectManager.email, password: TEST_PASSWORD });
  await expect(page).toHaveURL(/\/approvals$/);

  const nav = page.locator("nav");
  await expect(nav.getByRole("link", { name: "Approvals" })).toBeVisible();
  await expect(page.getByText("Project Manager", { exact: true })).toBeVisible();

  await page.goto("/expenses");
  await expect(page).toHaveURL(/\/approvals$/);
});

test("HR Head sees the HR nav (not Manager approvals), and is bounced out of the approvals queue", async ({ page }) => {
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await expect(page).toHaveURL(/\/expenses$/); // homeRouteFor(hr_head)

  const nav = page.locator("nav");
  await expect(nav.getByRole("link", { name: "Expense queue" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Decided claims" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Approvals" })).toHaveCount(0);
  // "HR Head" is both a nav section title and the role label — the role label
  // (sidebar footer) renders after nav in the DOM, so .last() disambiguates.
  await expect(page.getByText("HR Head", { exact: true }).last()).toBeVisible();

  await page.goto("/approvals");
  await expect(page).toHaveURL(/\/expenses$/);
});
