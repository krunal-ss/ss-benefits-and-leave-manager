// KAN-223 — Profile Completion Tracker. Acts through the UI as a freshly
// signed-up Employee (name set at signup, but phone/department/emergency-contact
// empty → 1 of 4 = 25% complete). No receipts/storage needed. Covers:
//   AC1 — the percentage updates automatically (live as you type, and persisted).
//   AC2 — missing fields are clearly displayed.
// plus a negative path (invalid phone is rejected and nothing persists) and an
// ownership check (the self-service form exposes no role / reporting-line editor).
import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./utils/auth-ui";

const PASSWORD = "Pass-1234";

test("completion % updates automatically and missing fields are shown, then persist (AC1, AC2)", async ({
  page,
}) => {
  await signup(page, {
    name: uniqueName("Profile Employee"),
    email: uniqueEmail("profile-complete"),
    password: PASSWORD,
  });

  // Fresh employee lands on the dashboard with the incomplete-profile nudge.
  await expect(page.getByTestId("dashboard-profile-percent")).toHaveText("25% done");
  await expect(page.getByText("Complete your profile")).toBeVisible();

  await page.goto("/profile");

  // AC2 — the missing fields are clearly displayed (name is already filled).
  await expect(page.getByTestId("profile-completion-percent")).toHaveText("25%");
  await expect(page.getByText("Still missing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Phone number" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Department" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Emergency contact" })).toBeVisible();

  // AC1 — the percentage updates automatically as each field is filled, with no save.
  await page.getByLabel("Phone number").fill("+91 98765 43210");
  await expect(page.getByTestId("profile-completion-percent")).toHaveText("50%");
  await page.getByLabel("Department").fill("Engineering");
  await expect(page.getByTestId("profile-completion-percent")).toHaveText("75%");
  await page.getByLabel("Emergency contact").fill("Asha Rao 9876500000");
  await expect(page.getByTestId("profile-completion-percent")).toHaveText("100%");

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();

  // Persisted: reload keeps 100% and clears the missing-field highlights.
  await page.reload();
  await expect(page.getByTestId("profile-completion-percent")).toHaveText("100%");
  await expect(page.getByText("Still missing")).toHaveCount(0);
  await expect(page.getByText("your profile is complete", { exact: false })).toBeVisible();

  // And the dashboard nudge disappears once complete.
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-profile-percent")).toHaveCount(0);
});

test("an invalid phone number is rejected and nothing is persisted (negative)", async ({ page }) => {
  await signup(page, {
    name: uniqueName("Profile Invalid"),
    email: uniqueEmail("profile-invalid"),
    password: PASSWORD,
  });
  await page.goto("/profile");

  await page.getByLabel("Phone number").fill("not-a-phone");
  await page.getByLabel("Department").fill("Design");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Enter a valid phone number.")).toBeVisible();

  // The whole update was rejected — reload shows the fields empty and 25% again.
  await page.reload();
  await expect(page.getByTestId("profile-completion-percent")).toHaveText("25%");
  await expect(page.getByLabel("Department")).toHaveValue("");
});

test("the self-service form cannot edit role or reporting lines (ownership)", async ({ page }) => {
  await signup(page, {
    name: uniqueName("Profile Scope"),
    email: uniqueEmail("profile-scope"),
    password: PASSWORD,
  });
  await page.goto("/profile");

  // Role is shown read-only under "Managed by HR", not as an editable control.
  await expect(page.getByText("Managed by HR")).toBeVisible();
  // Scoped to the page body — "Employee" also appears as the role label in the sidebar.
  await expect(page.getByRole("main").getByText("Employee", { exact: true })).toBeVisible();

  // The only editable inputs are the four personal fields — no role/reporting-line editor.
  await expect(page.locator("form input")).toHaveCount(4);
  await expect(page.locator("form select")).toHaveCount(0);
});
