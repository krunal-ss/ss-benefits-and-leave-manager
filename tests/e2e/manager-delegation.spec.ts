// KAN-225 — Manager Delegation. Drives the whole chain through the UI. Covers:
//   AC1 — requests route to the delegate (a delegate approves a leave routed to
//         the delegating TL; a non-HR delegate reaches the expense queue).
//   AC2 — a delegation stops granting access once it's cancelled or its window
//         has ended ("expires automatically").
// plus a no-privilege-leak check (a non-delegate never sees the delegated work).
import { test, expect, type Page } from "@playwright/test";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Delegate-Pass1";
const TL = FIXED_USERS.teamLead;
const PM = FIXED_USERS.projectManager;
const HR = FIXED_USERS.hrHead;

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The fixed TL's queue accumulates cards across specs — scope to one employee's card. */
function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  // Wait for the sign-out redirect to actually land on /login before the next
  // navigation — otherwise a following goto("/login") can race a still-valid
  // session and get redirected back into the app.
  await page.waitForURL(/\/login$/, { timeout: 30_000 });
}

async function createDelegation(
  page: Page,
  opts: { delegateName: string; delegateEmail: string; scope: "leave" | "expense" | "both"; from: string; to: string },
) {
  await page.goto("/settings/delegation");
  await page.locator("#del-delegate").selectOption({ label: `${opts.delegateName} (${opts.delegateEmail})` });
  await page.locator("#del-scope").selectOption(opts.scope);
  await page.locator("#del-start").fill(opts.from);
  await page.locator("#del-end").fill(opts.to);
  await page.getByRole("button", { name: "Delegate approvals" }).click();
  await expect(page.getByText("Delegated to")).toBeVisible();
}

// A fresh, uniquely-named Team Lead we fully control — avoids the shared DB's
// ambiguous fixed "E2E Team Lead" (multiple rows share that display name, so
// applyLeave's select-by-label could route to a different TL than the delegator).
async function signupManager(page: Page, label: string): Promise<{ name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD, role: "team_lead" });
  await signOut(page);
  return { name, email };
}

test("a delegate can approve a leave routed to the delegating Team Lead (AC1)", async ({ page }) => {
  // A controlled Team Lead the applicant routes to AND who creates the delegation.
  const mgr = await signupManager(page, "Deleg Manager");

  const employee = uniqueName("Delegation Applicant");
  await signup(page, { name: employee, email: uniqueEmail("deleg-applicant"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(2, 6);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: mgr.name, projectManagerName: PM.name, reason: "Delegation test" });
  await expect(page.getByText(`Request submitted — sent to ${mgr.name} (L1)`)).toBeVisible();
  await signOut(page);

  // A second Team Lead who will act as the delegate.
  const bobName = uniqueName("Delegate Bob");
  const bobEmail = uniqueEmail("deleg-bob");
  await signup(page, { name: bobName, email: bobEmail, password: PASSWORD, role: "team_lead" });
  await signOut(page);

  // The manager delegates leave approvals to Bob for a window covering today.
  await login(page, { email: mgr.email, password: PASSWORD });
  await createDelegation(page, { delegateName: bobName, delegateEmail: bobEmail, scope: "leave", from: isoInDays(-1), to: isoInDays(7) });
  await signOut(page);

  // Bob sees the delegated card (tagged on-behalf-of the manager) and approves it at L1.
  await login(page, { email: bobEmail, password: PASSWORD });
  const card = approvalCardFor(page, employee);
  await expect(card.getByText(`Acting on behalf of ${mgr.name}`)).toBeVisible();
  await card.getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
});

test("cancelling a delegation revokes the delegate's access, and a non-delegate never had it (AC2 + no leak)", async ({ page }) => {
  const mgr = await signupManager(page, "Revoke Manager");

  const employee = uniqueName("Revoke Applicant");
  await signup(page, { name: employee, email: uniqueEmail("revoke-applicant"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(2, 6);
  await applyLeave(page, { type: "Casual", from, to, teamLeadName: mgr.name, projectManagerName: PM.name, reason: "Revoke test" });
  await signOut(page);

  const bobName = uniqueName("Revoke Bob");
  const bobEmail = uniqueEmail("revoke-bob");
  await signup(page, { name: bobName, email: bobEmail, password: PASSWORD, role: "team_lead" });
  await signOut(page);

  // A different Team Lead who is NEVER delegated to — must not see the request.
  await signup(page, { name: uniqueName("Revoke Carol"), email: uniqueEmail("revoke-carol"), password: PASSWORD, role: "team_lead" });
  await page.goto("/approvals");
  await expect(page.getByText(employee)).toHaveCount(0);
  await signOut(page);

  // Delegate to Bob, confirm he sees it, then cancel and confirm it's gone.
  await login(page, { email: mgr.email, password: PASSWORD });
  await createDelegation(page, { delegateName: bobName, delegateEmail: bobEmail, scope: "both", from: isoInDays(-1), to: isoInDays(7) });
  await signOut(page);

  await login(page, { email: bobEmail, password: PASSWORD });
  await expect(approvalCardFor(page, employee).getByText(`Acting on behalf of ${mgr.name}`)).toBeVisible();
  await signOut(page);

  await login(page, { email: mgr.email, password: PASSWORD });
  await page.goto("/settings/delegation");
  await page.getByRole("button", { name: `Cancel delegation to ${bobName}` }).first().click();
  await expect(page.getByText("Delegation cancelled.")).toBeVisible();
  await signOut(page);

  // Bob no longer sees the delegated request.
  await login(page, { email: bobEmail, password: PASSWORD });
  await page.goto("/approvals");
  await expect(page.getByText(employee)).toHaveCount(0);
});

test("an expense delegation lets a non-HR delegate reach the expense queue (AC1)", async ({ page }) => {
  const daveName = uniqueName("Expense Dave");
  const daveEmail = uniqueEmail("deleg-dave");
  await signup(page, { name: daveName, email: daveEmail, password: PASSWORD }); // plain employee
  await signOut(page);

  // HR Head delegates expense approvals to Dave for a window covering today.
  await login(page, { email: HR.email, password: TEST_PASSWORD });
  await createDelegation(page, { delegateName: daveName, delegateEmail: daveEmail, scope: "expense", from: isoInDays(-1), to: isoInDays(7) });
  await signOut(page);

  // Dave (an employee) now gets the coverage banner + can open the expense queue,
  // which his own role would otherwise be redirected away from.
  await login(page, { email: daveEmail, password: PASSWORD });
  await expect(page.getByText(`You're covering approvals for ${HR.name}`)).toBeVisible();
  await page.getByRole("link", { name: "Expense queue" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
});

test("a delegation whose window has ended grants no coverage (AC2)", async ({ page }) => {
  const bobName = uniqueName("Expired Bob");
  const bobEmail = uniqueEmail("expired-bob");
  await signup(page, { name: bobName, email: bobEmail, password: PASSWORD, role: "team_lead" });
  await signOut(page);

  // Delegation entirely in the past — active row, but its window no longer covers today.
  await login(page, { email: TL.email, password: TEST_PASSWORD });
  await createDelegation(page, { delegateName: bobName, delegateEmail: bobEmail, scope: "both", from: isoInDays(-10), to: isoInDays(-1) });
  await signOut(page);

  await login(page, { email: bobEmail, password: PASSWORD });
  await expect(page.getByText(/covering approvals for/)).toHaveCount(0);
});
