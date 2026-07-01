import { test, expect } from "@playwright/test";

// Basic app-is-alive checks. Role-specific flows have their own spec files
// (auth.spec.ts, rbac-nav.spec.ts, etc.) — this file only checks the app boots
// and the auth gate is in effect, without needing a signed-in session.

test("login page shows the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Login to your account")).toBeVisible();
});

test("an unauthenticated visitor is redirected to login, not the dashboard", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
