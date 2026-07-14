// KAN-168 — Notification Preferences. This is the first PERSONAL (non-HR)
// settings screen in the app: any authenticated role reaches it, and it
// always operates on the caller's own row (never a target userId passed from
// the client). Scope note: only the "email" channel actually gates a send —
// push/in-app are recorded preferences with no delivery mechanism, so there's
// nothing observable to test for those two yet (see CLAUDE.md).
import { test, expect } from "@playwright/test";
import { login, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";
import { testDb, schema } from "./utils/db";
import { eq, and } from "drizzle-orm";

const PASSWORD = "Notify-Pass1";

test("any authenticated role can reach and use /settings/notifications", async ({ page }) => {
  await signup(page, { name: "Notify Nav Employee", email: uniqueEmail("notify-nav"), password: PASSWORD });
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.locator("nav").getByRole("link", { name: "Notification preferences" }).click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  await expect(page.getByRole("heading", { name: "Notification preferences" })).toBeVisible();

  // Defaults: every channel on, quiet hours off.
  await expect(page.getByRole("switch", { name: "Email" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Browser push" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "In-app" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Quiet hours" })).toHaveAttribute("aria-checked", "false");

  // Turn quiet hours on, set a window, save, and confirm it persists across a reload.
  await page.getByRole("switch", { name: "Quiet hours" }).click();
  await page.getByLabel("From").fill("22:00");
  await page.getByLabel("To").fill("07:00");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("switch", { name: "Quiet hours" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("From")).toHaveValue("22:00");
  await expect(page.getByLabel("To")).toHaveValue("07:00");
});

test("two different users get independent preference state", async ({ page }) => {
  // User A turns their own email notifications off.
  await signup(page, { name: "Notify User A", email: uniqueEmail("notify-a"), password: PASSWORD });
  await page.goto("/settings/notifications");
  await page.getByRole("switch", { name: "Email" }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Email" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Sign out" }).click();

  // A brand-new User B must see the untouched defaults, not User A's edit —
  // proving the row is keyed per-user, not a single shared/global row.
  await signup(page, { name: "Notify User B", email: uniqueEmail("notify-b"), password: PASSWORD });
  await page.goto("/settings/notifications");
  await expect(page.getByRole("switch", { name: "Email" })).toHaveAttribute("aria-checked", "true");
});

test("turning email off blocks an existing email-sending flow (expense decision) from sending", async ({ page }) => {
  const applicantEmail = uniqueEmail("notify-gate");
  await signup(page, { name: uniqueName("Notify Gate Employee"), email: applicantEmail, password: PASSWORD });

  // Turn the applicant's own email notifications off before anything is sent to them.
  await page.goto("/settings/notifications");
  await page.getByRole("switch", { name: "Email" }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved.")).toBeVisible();

  // Submit a receipt-less claim — verification.ts can never auto-approve
  // without a document, so this deterministically routes to HR (pending_hr).
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: "Sports" }).click();
  await page.locator("input[inputmode='numeric']").fill("900");
  await page.locator("input[type='date']").fill(new Date().toISOString().slice(0, 10));
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill("Notify Gate Gym");
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });

  await page.goto("/expenses");
  const row = page.locator("table tbody tr", { hasText: applicantEmail }).or(
    page.locator("table tbody tr", { hasText: "Notify Gate" }),
  );
  await row.first().getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Approve ₹900" }).click();
  // The decision itself always succeeds and shows the same copy regardless of
  // whether the best-effort notification actually went out — there is no
  // UI-visible signal that distinguishes "sent" from "gated by preferences",
  // so this one assertion reads the emailLog audit trail directly (arrangement-
  // style DB access, same as the rest of this suite's fixtures) rather than
  // asserting on a toast that wouldn't change either way.
  await expect(page.getByText("Approved ₹900 — employee notified")).toBeVisible();

  const db = testDb();
  const sentRows = await db
    .select({ id: schema.emailLog.id })
    .from(schema.emailLog)
    .where(and(eq(schema.emailLog.toAddress, applicantEmail), eq(schema.emailLog.template, "expense_decision")));
  expect(sentRows).toHaveLength(0);
});
