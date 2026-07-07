// KAN-148 — Remaining Benefit Reminder. Covers the HR-only "Benefit
// reminders" settings screen (schedule checkpoints + audience count) and the
// employee dashboard banner it drives. No automated per-employee email
// fan-out is in scope for this pass (see CLAUDE.md) — only the settings
// screen, the manual "Send test to me", and the dashboard banner.
import { test, expect } from "@playwright/test";
import { login, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";

test.describe("Benefit reminders — HR config screen", () => {
  test("HR Head can open the screen, toggle a checkpoint, save, and see the audience count", async ({ page }) => {
    await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Benefit reminders" })).toBeVisible();
    await nav.getByRole("link", { name: "Benefit reminders" }).click();
    await expect(page).toHaveURL(/\/reminders$/);
    await expect(page.getByRole("heading", { name: "Benefit reminders" })).toBeVisible();

    // ---- schedule: toggle the 14-day checkpoint chip ----
    const chip14 = page.getByRole("button", { name: "14", exact: true });
    await chip14.click();

    // ---- pin the audience threshold + delivery channels to a known-good
    // state (this is a single shared settings row, read by every employee's
    // dashboard banner — later specs/runs must find dashboardEnabled on and a
    // low threshold, or the banner assertions below would flake). ----
    const thresholdInput = page.getByLabel("Only remind employees with unused balance above");
    await thresholdInput.fill("5000");

    const dashboardSwitch = page.getByRole("switch", { name: "Dashboard banner" });
    if ((await dashboardSwitch.getAttribute("aria-checked")) !== "true") await dashboardSwitch.click();
    const emailSwitch = page.getByRole("switch", { name: "Email reminder" });
    if ((await emailSwitch.getAttribute("aria-checked")) !== "true") await emailSwitch.click();

    await expect(page.getByText(/employees currently qualify/)).toBeVisible();

    await page.getByRole("button", { name: "Save schedule" }).click();
    await expect(page.getByText("Reminder schedule saved.")).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // Reload and confirm the checkpoint persisted (real DB round-trip, not just client state).
    await page.reload();
    await expect(page.getByRole("button", { name: "14", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("Employee cannot access the benefit-reminders screen", async ({ page }) => {
    await signup(page, { name: "Nav Blocked Employee", email: uniqueEmail("reminders-emp"), password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.locator("nav").getByRole("link", { name: "Benefit reminders" })).toHaveCount(0);

    await page.goto("/reminders");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe("Benefit reminders — employee dashboard banner", () => {
  test("shows the unused-balance banner for an eligible employee, and dismissing it hides it", async ({ page }) => {
    const name = uniqueName("Reminder Banner Employee");
    await signup(page, { name, email: uniqueEmail("reminder-banner"), password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);

    // A brand-new employee has their full annual cap unused (₹60,000 across
    // Sports + Learning) — comfortably above the ₹5,000 default/pinned threshold.
    await expect(page.getByText(/unused in your benefit wallet/)).toBeVisible();
    await expect(page.getByText(/days left/)).toBeVisible();
    await expect(page.getByText(/Sports ₹/)).toBeVisible();
    await expect(page.getByText(/Learning ₹/)).toBeVisible();

    await page.getByRole("button", { name: "Dismiss reminder" }).click();
    await expect(page.getByText(/unused in your benefit wallet/)).toHaveCount(0);
  });
});
