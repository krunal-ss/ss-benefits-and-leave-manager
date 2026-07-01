// KAN-18: multi-level leave approvals + email + audit. Default policy is reset
// to sequential in global setup, so every request here is TL(L1) -> PM(L2).
import { test, expect, type Page } from "@playwright/test";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Approval-Pass1";
const TL = FIXED_USERS.teamLead;
const PM = FIXED_USERS.projectManager;

/** The fixed approver queues accumulate cards across specs — scope to one employee's card. */
function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

test("sequential approval: Team Lead approves to L2, Project Manager gives final approval and the balance is deducted", async ({ page }) => {
  const name = uniqueName("Ibrahim Qureshi");
  await signup(page, { name, email: uniqueEmail("approve1"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(2, 6);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "Wedding" });
  await expect(page.getByText(`Request submitted — sent to ${TL.name} (L1)`)).toBeVisible();

  // Not visible to the PM yet — sequential mode only surfaces it after L1 acts.
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await expect(page.getByText(name)).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  const l1card = approvalCardFor(page, name);
  await expect(l1card.getByRole("button", { name: "Approve → L2" })).toBeVisible();
  await l1card.getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  const l2card = approvalCardFor(page, name);
  await expect(l2card.getByRole("button", { name: "Approve (final)" })).toBeVisible();
  await l2card.getByRole("button", { name: "Approve (final)" }).click();
  await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();

  await page.goto("/leave");
  await expect(page.locator("table tbody tr").first()).toContainText("Approved");
  // 12-day opening CL balance − 2 approved days.
  await expect(page.getByText("10 days")).toBeVisible();
});

test("Team Lead rejecting at L1 stops the request and never touches the balance", async ({ page }) => {
  const name = uniqueName("Meher Chawla");
  await signup(page, { name, email: uniqueEmail("reject1"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(2, 7);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "Personal" });
  await expect(page.getByText(`Request submitted — sent to ${TL.name} (L1)`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  await approvalCardFor(page, name).getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Request rejected — applicant notified")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await expect(page.getByText(name)).toHaveCount(0); // never reached L2
});

test("Project Manager rejecting at L2 (after L1 approval) does not deduct the balance", async ({ page }) => {
  const name = uniqueName("Tanvi Oberoi");
  const email = uniqueEmail("reject2");
  await signup(page, { name, email, password: PASSWORD });
  const { from, to } = pickWorkdayRange(2, 8);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "Trip" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  await approvalCardFor(page, name).getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await approvalCardFor(page, name).getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Request rejected — applicant notified")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email, password: PASSWORD });
  await page.goto("/leave");
  await expect(page.locator("table tbody tr").first()).toContainText("Rejected");
  await expect(page.getByText("12 days")).toBeVisible(); // untouched opening balance
});
