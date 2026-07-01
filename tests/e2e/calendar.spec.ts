// KAN-17: team calendar (leave/WFH/holidays) with role scoping + month nav.
// Calendar visibility is scoped by users.teamLeadId/projectManagerId (the
// employee's reporting line), NOT by the per-request approver choice — so the
// employee fixture here must be wired via wireReportingLine before applying.
import { test, expect } from "@playwright/test";
import { signup, login, uniqueEmail } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, wireReportingLine } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Calendar-Pass1";

test("a Team Lead sees their reportee's WFH request on the calendar for the right month; HR Head sees it too", async ({ page }) => {
  // The calendar label only ever shows the FIRST name (see src/server/calendar.ts) —
  // so the suffix must be on the first word itself, or repeat runs on the same
  // live DB (which can land on the same calendar day) collide on "Kabir · WFH".
  const employeeName = `Kabir${Math.floor(Math.random() * 1e6)} Malhotra`;
  const employeeEmail = uniqueEmail("cal-scope");
  await signup(page, { name: employeeName, email: employeeEmail, password: PASSWORD });
  await wireReportingLine(employeeEmail);

  const { from, to } = pickWorkdayRange(2, 5);
  await applyLeave(page, {
    type: "WFH",
    from,
    to,
    teamLeadName: FIXED_USERS.teamLead.name,
    projectManagerName: FIXED_USERS.projectManager.name,
    reason: "Broadband install",
  });
  await expect(page.getByText(`Request submitted — sent to ${FIXED_USERS.teamLead.name} (L1)`)).toBeVisible();

  const targetMonth = from.slice(0, 7);
  const firstName = employeeName.split(" ")[0];

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
  await page.goto(`/calendar?m=${targetMonth}`);
  await expect(page.getByText(`${firstName} · WFH`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto(`/calendar?m=${targetMonth}`);
  await expect(page.getByText(`${firstName} · WFH`)).toBeVisible();
});

test("month navigation moves forward/back and 'This month' returns to today", async ({ page }) => {
  await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
  await page.goto("/calendar");

  const monthLabel = page
    .getByRole("link", { name: "Previous month" })
    .locator("xpath=following-sibling::span[1]");
  const initial = await monthLabel.textContent();

  await page.getByRole("link", { name: "Next month" }).click();
  await expect(monthLabel).not.toHaveText(initial ?? "");

  await page.getByRole("link", { name: "This month" }).click();
  await expect(monthLabel).toHaveText(initial ?? "");
});

test("the legend shows Leave, WFH, and Holiday categories", async ({ page }) => {
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto("/calendar");

  await expect(page.getByText("Leave", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("WFH", { exact: true }).first()).toBeVisible();
  // "Holiday" also collides with a day cell's holiday-name label when the
  // viewed month contains one (e.g. the seeded 17th) — legend renders first.
  await expect(page.getByText("Holiday", { exact: true }).first()).toBeVisible();
});
