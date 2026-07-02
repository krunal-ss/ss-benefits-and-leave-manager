// KAN-77: leave conflict & critical-role guard at apply/approval time.
// Advisory-only (never blocks): a leave/WFH request that would breach the
// configured staffing threshold, or remove the only available critical-role
// holder for a day, shows a distinct non-blocking warning to the applicant
// (while filling the form, not just after) and to the approver (on the queue
// row, before they decide) — but the request/decision always still succeeds.
//
// Each test builds its own fresh Team Lead + small, department-scoped team
// (see utils/team.ts) with an explicit department-threshold override (see
// utils/fixtures.ts's setDepartmentThreshold) so the outcome is fully
// deterministic regardless of the shared org-wide default or any other spec
// file's leftover data on the live DB.
import { test, expect, type Page } from "@playwright/test";
import { login, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, setDepartmentThreshold } from "./utils/fixtures";
import { makeTeamLead, makeReport } from "./utils/team";
import { pickWorkday } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Guard-Pass1";
const PM = FIXED_USERS.projectManager;

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

test("a request that would breach the configured staffing threshold shows a warning before submitting, and does not block the request", async ({ page }) => {
  const dept = uniqueName("KAN77 Threshold Dept");
  await setDepartmentThreshold(dept, 60); // 2 reports, 1 on leave -> 50% < 60%

  const tl = await makeTeamLead(page, "KAN77 Threshold TL", PASSWORD);
  const emp1 = await makeReport(page, "KAN77 Threshold Emp One", { teamLeadId: tl.id, password: PASSWORD, department: dept });
  await makeReport(page, "KAN77 Threshold Emp Two", { teamLeadId: tl.id, password: PASSWORD, department: dept });

  const leaveDay = pickWorkday(3);

  await login(page, { email: emp1.email, password: PASSWORD });
  await page.goto("/leave");
  await page.getByRole("button", { name: "Casual", exact: true }).click();
  const dateInputs = page.locator("input[type='date']");
  await dateInputs.nth(0).fill(leaveDay);
  await dateInputs.nth(1).fill(leaveDay);
  await page.locator("select").nth(0).selectOption({ label: tl.name });
  await page.locator("select").nth(1).selectOption({ label: PM.name });
  await page.getByPlaceholder("Add context for your approvers…").fill("Threshold guard fixture");

  // Visible BEFORE the Submit button is clicked — the live preview check.
  await expect(page.getByText(/would drop below the configured staffing threshold/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeEnabled();

  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();
  // The advisory warning never blocked the submission, and still shows afterwards.
  await expect(page.getByText(/would drop below the configured staffing threshold/)).toBeVisible();

  // The approver sees the same kind of warning on the queue row, before deciding.
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: tl.email, password: TEST_PASSWORD });
  const card = approvalCardFor(page, emp1.name);
  await expect(card.getByText(/below the configured threshold/)).toBeVisible();

  // Still non-blocking at approval time too.
  await card.getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
});

test("a request that would leave the team without its only available critical-role holder shows a distinct warning, to both applicant and approver", async ({ page }) => {
  const dept = uniqueName("KAN77 Critical Dept");
  await setDepartmentThreshold(dept, 0); // never breaches — isolates this test to the critical-role check only

  const tl = await makeTeamLead(page, "KAN77 Critical TL", PASSWORD);
  const emp1 = await makeReport(page, "KAN77 Critical Emp One", {
    teamLeadId: tl.id,
    password: PASSWORD,
    department: dept,
    isCriticalRole: true,
  });
  await makeReport(page, "KAN77 Critical Emp Two", { teamLeadId: tl.id, password: PASSWORD, department: dept });

  const leaveDay = pickWorkday(3);

  await login(page, { email: emp1.email, password: PASSWORD });
  await page.goto("/leave");
  await page.getByRole("button", { name: "Casual", exact: true }).click();
  const dateInputs = page.locator("input[type='date']");
  await dateInputs.nth(0).fill(leaveDay);
  await dateInputs.nth(1).fill(leaveDay);
  await page.locator("select").nth(0).selectOption({ label: tl.name });
  await page.locator("select").nth(1).selectOption({ label: PM.name });
  await page.getByPlaceholder("Add context for your approvers…").fill("Critical-role guard fixture");

  // Distinct from the threshold warning, visible before submitting.
  await expect(page.getByText(/No other critical-role holder would be available to cover for you/)).toBeVisible();
  await expect(page.getByText(/would drop below the configured staffing threshold/)).toHaveCount(0);

  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: tl.email, password: TEST_PASSWORD });
  const card = approvalCardFor(page, emp1.name);
  await expect(card.getByText(/only available critical-role holder/)).toBeVisible();

  // Advisory only — approving still succeeds.
  await card.getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
});

test("a request that neither breaches the threshold nor removes sole critical-role coverage shows no staffing warnings", async ({ page }) => {
  const dept = uniqueName("KAN77 Clean Dept");
  await setDepartmentThreshold(dept, 10); // low bar — losing 1 of 4 reports (75% available) stays well clear

  const tl = await makeTeamLead(page, "KAN77 Clean TL", PASSWORD);
  const emp1 = await makeReport(page, "KAN77 Clean Emp One", { teamLeadId: tl.id, password: PASSWORD, department: dept });
  await makeReport(page, "KAN77 Clean Emp Two", { teamLeadId: tl.id, password: PASSWORD, department: dept });
  await makeReport(page, "KAN77 Clean Emp Three", { teamLeadId: tl.id, password: PASSWORD, department: dept });
  await makeReport(page, "KAN77 Clean Emp Four", { teamLeadId: tl.id, password: PASSWORD, department: dept });

  const leaveDay = pickWorkday(3);

  await login(page, { email: emp1.email, password: PASSWORD });
  await applyLeave(page, {
    type: "Casual",
    from: leaveDay,
    to: leaveDay,
    teamLeadName: tl.name,
    projectManagerName: PM.name,
    reason: "Clean request fixture",
  });

  await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();
  await expect(page.getByText(/would drop below the configured staffing threshold/)).toHaveCount(0);
  await expect(page.getByText(/No other critical-role holder would be available to cover for you/)).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: tl.email, password: TEST_PASSWORD });
  const card = approvalCardFor(page, emp1.name);
  await expect(card.getByRole("button", { name: "Approve → L2" })).toBeVisible();
  await expect(card.getByText(/below the configured threshold/)).toHaveCount(0);
  await expect(card.getByText(/only available critical-role holder/)).toHaveCount(0);
});
