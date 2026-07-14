// KAN-206 — Public Holiday Countdown. Covers AC1 (countdown shown for the
// next upcoming holiday, computed fresh on each page load) and AC2 (only
// holidays matching the user's office/location — or org-wide ones — are
// eligible; a nearer holiday scoped to a different office must not win).
import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { setUserLocation } from "./utils/fixtures";
import { testDb, schema } from "./utils/db";

test.describe("Public Holiday Countdown widget", () => {
  test("shows the next org-wide holiday with a countdown on the dashboard", async ({ page }) => {
    await signup(page, { name: uniqueName("Holiday Widget Employee"), email: uniqueEmail("holiday-widget"), password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByText("Next public holiday:")).toBeVisible();
    await expect(page.getByText(/Today|Tomorrow|In \d+ days?/)).toBeVisible();
  });

  test("a nearer holiday scoped to a different office does not override the org-wide one", async ({ page }) => {
    const email = uniqueEmail("holiday-widget-loc");
    await signup(page, { name: uniqueName("Holiday Widget Regional"), email, password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);
    await setUserLocation(email, "Pune");

    // A holiday tomorrow, scoped to an office this user is NOT in.
    const db = testDb();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().slice(0, 10);
    await db.insert(schema.holidays).values({ date: tomorrowISO, name: "Bengaluru Founding Day", location: "Bengaluru" });

    await page.reload();
    await expect(page.getByText("Next public holiday:")).toBeVisible();
    await expect(page.getByText("Bengaluru Founding Day")).toHaveCount(0);
  });

  test("an employee at the matching office sees a location-scoped holiday", async ({ page }) => {
    const email = uniqueEmail("holiday-widget-match");
    await signup(page, { name: uniqueName("Holiday Widget Mumbai"), email, password: "Pass-1234" });
    await expect(page).toHaveURL(/\/dashboard$/);
    await setUserLocation(email, "Mumbai");

    // A holiday sooner than the seeded org-wide one, scoped to this user's own office.
    const db = testDb();
    const soon = new Date();
    soon.setDate(soon.getDate() + 1);
    const soonISO = soon.toISOString().slice(0, 10);
    await db.insert(schema.holidays).values({ date: soonISO, name: "Mumbai Office Day", location: "Mumbai" });

    await page.reload();
    await expect(page.getByText("Next public holiday:")).toBeVisible();
    await expect(page.getByText("Mumbai Office Day")).toBeVisible();
  });
});
