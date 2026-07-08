// KAN-127 (Leave Cancellation Request) — requesting cancellation of an already
// APPROVED, not-yet-started leave, distinct from cancel-leave.ts's still-pending
// withdraw (covered by leave-apply.spec.ts). Default policy requires the
// approver's sign-off (requireLeaveCancellationApproval defaults to true), so
// these scenarios exercise the request → approve/decline path end to end.
import { test, expect, type Page } from "@playwright/test";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Cancel-Pass1";
const TL = FIXED_USERS.teamLead;
const PM = FIXED_USERS.projectManager;

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

function cancellationCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Decline" }) })
    .last();
}

/** Applies, TL approves → L2, PM gives final approval — leaves the employee logged in on /leave. */
async function applyAndFullyApprove(page: Page, opts: { name: string; email: string; from: string; to: string }) {
  await signup(page, { name: opts.name, email: opts.email, password: PASSWORD });
  await applyLeave(page, {
    type: "Casual",
    from: opts.from,
    to: opts.to,
    teamLeadName: TL.name,
    projectManagerName: PM.name,
    reason: "Family function",
  });

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  await approvalCardFor(page, opts.name).getByRole("button", { name: "Approve → L2" }).click();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await approvalCardFor(page, opts.name).getByRole("button", { name: "Approve (final)" }).click();
  await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: opts.email, password: PASSWORD });
}

test("requesting cancellation of an approved leave, then the approver accepting it, restores the balance", async ({ page }) => {
  const name = uniqueName("Farah Sheikh");
  const email = uniqueEmail("cancel-approve");
  const { from, to } = pickWorkdayRange(2, 6);
  await applyAndFullyApprove(page, { name, email, from, to });

  await page.goto("/leave");
  await expect(page.locator("table tbody tr").first()).toContainText("Approved");
  await expect(page.getByText("10 days")).toBeVisible(); // 12-day opening CL balance − 2 approved days

  await page.locator("table tbody tr").first().click();
  await page.getByRole("button", { name: "Request cancellation" }).click();
  await page.getByRole("button", { name: "Request cancellation" }).click(); // confirm
  await expect(page.getByText("Cancellation requested — awaiting approver sign-off.")).toBeVisible();

  await page.goto("/leave");
  await expect(page.locator("table tbody tr").first()).toContainText("Cancellation requested");

  // Sequential mode's final approver was the PM — they decide the cancellation.
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await cancellationCardFor(page, name).getByRole("button", { name: "Approve cancellation" }).click();
  await expect(page.getByText("Cancellation approved — balance restored, applicant notified.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email, password: PASSWORD });
  await page.goto("/leave");
  await expect(page.locator("table tbody tr").first()).toContainText("Cancelled");
  await expect(page.getByText("12 days")).toBeVisible(); // fully restored
});

test("the approver declining a cancellation request leaves the leave approved and the balance untouched", async ({ page }) => {
  const name = uniqueName("Rehan Mistry");
  const email = uniqueEmail("cancel-decline");
  const { from, to } = pickWorkdayRange(3, 6);
  await applyAndFullyApprove(page, { name, email, from, to });

  await page.goto("/leave");
  await page.locator("table tbody tr").first().click();
  await page.getByRole("button", { name: "Request cancellation" }).click();
  await page.getByRole("button", { name: "Request cancellation" }).click();
  await expect(page.getByText("Cancellation requested — awaiting approver sign-off.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await cancellationCardFor(page, name).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Cancellation declined — the leave stays approved, applicant notified.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email, password: PASSWORD });
  await page.goto("/leave");
  await expect(page.locator("table tbody tr").first()).toContainText("Approved");
  await expect(page.getByText("9 days")).toBeVisible(); // still deducted — 12 − 3
});
