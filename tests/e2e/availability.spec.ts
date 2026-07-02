// KAN-75: team availability heatmap (manager view) — an aggregate capacity view
// distinct from the day-by-day /calendar. Business rules under test: weekends/
// holidays are excluded from % available, an approved leave day reduces
// availability, and the heatmap is scoped like every other manager view
// (Team Lead/Project Manager see only their own reports; HR Head/Admin can
// view any team).
//
// The shared fixed Team Lead/PM accounts (FIXED_USERS) accumulate reports
// across every spec file on this live DB, so their headcount/% aren't
// deterministic here — this spec creates its own fresh Team Lead(s) with a
// small, test-controlled headcount instead, so the exact % can be asserted.
import { test, expect, type Page } from "@playwright/test";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, wireTeamLead, getUserIdByEmail } from "./utils/fixtures";
import { pickWorkday } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Avail-Pass1";
const PM = FIXED_USERS.projectManager;

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

/** Sign up a fresh Team Lead and return their id + name, then sign back out. */
async function makeTeamLead(page: Page, label: string): Promise<{ id: string; name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD, role: "team_lead" });
  const id = await getUserIdByEmail(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { id, name, email };
}

/** Sign up a fresh employee, wire their reporting line to `teamLeadId`, sign back out. */
async function makeReport(page: Page, label: string, teamLeadId: string): Promise<{ name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD });
  await wireTeamLead(email, teamLeadId);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { name, email };
}

test("a day with an approved leave request renders the reduced % available in the matching color band, scoped to that Team Lead's own reports", async ({ page }) => {
  const tlA = await makeTeamLead(page, "Avail TL A");
  const tlB = await makeTeamLead(page, "Avail TL B");

  const emp1 = await makeReport(page, "Avail Emp One", tlA.id);
  await makeReport(page, "Avail Emp Two", tlA.id); // second report on TL A's team — stays available
  await makeReport(page, "Avail Emp Three", tlB.id); // TL B's only report

  const leaveDay = pickWorkday(3);
  const month = leaveDay.slice(0, 7);

  // emp1 applies a single-day Casual Leave request, routed to TL A / the fixed PM.
  await login(page, { email: emp1.email, password: PASSWORD });
  await applyLeave(page, {
    type: "Casual",
    from: leaveDay,
    to: leaveDay,
    teamLeadName: tlA.name,
    projectManagerName: PM.name,
    reason: "Availability heatmap fixture",
  });
  await expect(page.getByText(`Request submitted — sent to ${tlA.name} (L1)`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // Carry it through to a full approval so the fixture is genuinely "approved".
  await login(page, { email: tlA.email, password: TEST_PASSWORD });
  await approvalCardFor(page, emp1.name).getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await approvalCardFor(page, emp1.name).getByRole("button", { name: "Approve (final)" }).click();
  await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // TL A: 2 direct reports, 1 on approved leave on `leaveDay` -> 50% available, amber band.
  await login(page, { email: tlA.email, password: TEST_PASSWORD });
  await page.goto(`/availability?m=${month}`);
  await expect(page.getByText("2 direct reports")).toBeVisible();
  const pctFigure = page.getByText("50%", { exact: true });
  await expect(pctFigure).toBeVisible();
  await expect(pctFigure).toHaveClass(/text-amber-600/);
  await expect(page.getByText("1/2 available")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // TL B has a single, unaffected report — confirms the heatmap is scoped to
  // this manager's own team and doesn't pick up TL A's headcount/leave.
  await login(page, { email: tlB.email, password: TEST_PASSWORD });
  await page.goto(`/availability?m=${month}`);
  await expect(page.getByText("1 direct report", { exact: true })).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();

  // HR Head can view TL A's team specifically via ?team=, and sees the same 50% figure.
  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto(`/availability?m=${month}&team=${tlA.id}`);
  await expect(page.getByText("2 direct reports")).toBeVisible();
  await expect(page.getByText(`Capacity & coverage for ${tlA.name}`, { exact: false })).toBeVisible();
  const hrPctFigure = page.getByText("50%", { exact: true });
  await expect(hrPctFigure).toBeVisible();
  await expect(hrPctFigure).toHaveClass(/text-amber-600/);

  // Switching the team param to TL B shows TL B's team instead.
  await page.goto(`/availability?m=${month}&team=${tlB.id}`);
  await expect(page.getByText("1 direct report", { exact: true })).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).toHaveCount(0);
});
