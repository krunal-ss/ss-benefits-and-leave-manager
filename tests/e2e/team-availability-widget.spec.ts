// KAN-205/210: Team Leave Today widget on /dashboard. Business rules under
// test: the widget's counts/percentage reflect an approved leave request
// covering TODAY (no separate "refresh" step — a Server Component re-fetch
// on navigation is the "updates immediately" behaviour), visibility of the
// "Team calendar" link differs by role (Employee can't reach /calendar), and
// an employee with no reporting line sees the empty state instead of
// somebody else's team.
//
// The widget is scoped to the real "today" (no ?date= override, unlike the
// heatmap/department-overview screens), so whether today is a working day
// isn't test-controlled — this spec checks that once, locally, and asserts
// the exact 50%/on-leave figure on a working day or the "Non-working day"
// state otherwise, rather than picking a fixed future date the widget
// would never look at.
//
// Uses a fresh Team Lead + 2 reports (KAN-75's pattern in availability.spec.ts)
// rather than the shared FIXED_USERS Team Lead, so headcount/% are exact.
import { test, expect, type Page } from "@playwright/test";
import { login, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";
import { makeTeamLead, makeReport } from "./utils/team";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Widget-Pass1";
const PM = FIXED_USERS.projectManager;

// Mirrors the one holiday `ensureBaseData` seeds (utils/fixtures.ts) —
// duplicated here rather than imported, same independence rationale as
// utils/dates.ts's own HOLIDAYS set.
const HOLIDAYS = new Set(["2026-07-17"]);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isWorkingDayToday(): boolean {
  const dow = new Date().getDay();
  return dow !== 0 && dow !== 6 && !HOLIDAYS.has(todayISO());
}

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

test("Team Leave Today widget: role scope, calendar-link visibility, and the empty state", async ({ page }) => {
  const tl = await makeTeamLead(page, "Widget TL", PASSWORD);
  const emp1 = await makeReport(page, "Widget Emp One", { teamLeadId: tl.id, password: PASSWORD });
  const emp2 = await makeReport(page, "Widget Emp Two", { teamLeadId: tl.id, password: PASSWORD });

  const workingToday = isWorkingDayToday();

  if (workingToday) {
    const today = todayISO();
    await login(page, { email: emp1.email, password: PASSWORD });
    await applyLeave(page, {
      type: "Casual",
      from: today,
      to: today,
      teamLeadName: tl.name,
      projectManagerName: PM.name,
      reason: "Team availability widget fixture",
    });
    await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, { email: tl.email, password: PASSWORD });
    await approvalCardFor(page, emp1.name).getByRole("button", { name: "Approve → L2" }).click();
    await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, { email: PM.email, password: TEST_PASSWORD });
    await approvalCardFor(page, emp1.name).getByRole("button", { name: "Approve (final)" }).click();
    await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
  }

  // Team Lead: own 2 reports, "Team calendar" link visible (TL can access /calendar).
  await login(page, { email: tl.email, password: PASSWORD });
  await page.goto("/dashboard");
  await expect(page.getByText("Team availability today")).toBeVisible();
  await expect(page.getByText("Your team")).toBeVisible();
  await expect(page.getByText("2 team members")).toBeVisible();
  if (workingToday) {
    await expect(page.getByText("50%", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText("Non-working day")).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Team calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // A peer (emp2, not the leave-taker) sees the SAME team-wide widget, scoped
  // via their own reporting line — but no "Team calendar" link, since /calendar
  // is Team Lead/Project Manager/HR-Head/Admin only.
  await login(page, { email: emp2.email, password: PASSWORD });
  await page.goto("/dashboard");
  await expect(page.getByText("Team availability today")).toBeVisible();
  await expect(page.getByText(`${tl.name}'s team`)).toBeVisible();
  await expect(page.getByText("2 team members")).toBeVisible();
  await expect(page.getByRole("link", { name: "Team calendar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();

  // An employee with no reporting line sees the empty state, never another team's data.
  const loneEmail = uniqueEmail("widget-lone");
  await signup(page, { name: uniqueName("Widget Lone Employee"), email: loneEmail, password: PASSWORD });
  await page.goto("/dashboard");
  await expect(page.getByText("No team assigned yet.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
});
