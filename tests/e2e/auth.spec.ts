// KAN-11: email/password auth, session & password reset.
import { test, expect } from "@playwright/test";
import { login, logout, signup, uniqueEmail } from "./utils/auth-ui";

const PASSWORD = "Sign-up-Pass1";

test("employee can sign up and lands signed-in on their dashboard", async ({ page }) => {
  const email = uniqueEmail("signup");
  await signup(page, { name: "Asha Verma", email, password: PASSWORD });

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Asha" })).toBeVisible();
  // Role is sourced from the DB, not the client — sidebar reflects "Employee".
  await expect(page.getByText("Employee", { exact: true })).toBeVisible();
});

test("an existing user can sign out and log back in", async ({ page }) => {
  const email = uniqueEmail("relogin");
  await signup(page, { name: "Rahul Singh", email, password: PASSWORD });
  await expect(page).toHaveURL(/\/dashboard$/);

  await logout(page);
  await login(page, { email, password: PASSWORD });

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome back, Rahul" })).toBeVisible();
});

test("a wrong password is rejected and no session is created", async ({ page }) => {
  const email = uniqueEmail("badpass");
  await signup(page, { name: "Neha Kapoor", email, password: PASSWORD });
  await logout(page);

  await page.goto("/login");
  await page.getByPlaceholder("aarav@smartsense.com").fill(email);
  await page.getByPlaceholder("••••••••").fill("totally-wrong-password");
  await page.getByRole("button", { name: "Login" }).click();

  // Stays on /login with an inline error — never silently signed in.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("p.text-destructive")).toBeVisible();
});

test("the signup role selector never offers HR Head or Admin (self-escalation guard)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up" }).click();

  const roleOptions = await page.locator("select[name='role'] option").allTextContents();
  expect(roleOptions).toEqual(["Employee", "Team Lead", "Project Manager"]);
  expect(roleOptions).not.toContain("HR Head");
  expect(roleOptions).not.toContain("Admin");
});

test("requesting a password reset shows the confirmation panel", async ({ page }) => {
  // Supabase never reveals whether an account exists for this email (anti
  // enumeration) — a real, deliverable-looking address is enough to exercise
  // the UI flow; mailinator.com is a public throwaway inbox, safe to target.
  const email = `e2e.forgot.${Date.now()}@mailinator.com`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByPlaceholder("aarav@smartsense.com").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByText("Check your email")).toBeVisible();
  await expect(page.getByText("We sent a reset link to your inbox.", { exact: false })).toBeVisible();
});

test("visiting a protected route while signed out redirects to login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdashboard/);
});
