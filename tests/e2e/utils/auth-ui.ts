import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Unique per test run so parallel/repeat runs against the live project never collide. */
export function uniqueEmail(prefix: string): string {
  return `e2e.${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
}

/**
 * A display name with a unique numeric suffix — needed whenever a test looks
 * a row up by name later (HR queue, approvals queue). Repeat runs against the
 * same live DB leave old rows behind, so a fixed literal name like "Ishaan
 * Kapoor" collides with an earlier run's row of the same name.
 */
export function uniqueName(base: string): string {
  return `${base} ${Math.floor(Math.random() * 1e6)}`;
}

export type SignupRole = "employee" | "team_lead" | "project_manager";

/** Signs up a brand-new employee/TL/PM via the real UI and waits for the post-login redirect. */
export async function signup(
  page: Page,
  opts: { name: string; email: string; password: string; role?: SignupRole },
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.getByPlaceholder("Aarav Sharma").fill(opts.name);
  await page.getByPlaceholder("aarav@smartsense.com").fill(opts.email);
  if (opts.role) await page.locator("select[name='role']").selectOption(opts.role);
  await page.getByPlaceholder("At least 8 characters").fill(opts.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}

/** Logs in an existing user via the real UI and waits for the post-login redirect. */
export async function login(page: Page, opts: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("aarav@smartsense.com").fill(opts.email);
  await page.getByPlaceholder("••••••••").fill(opts.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
