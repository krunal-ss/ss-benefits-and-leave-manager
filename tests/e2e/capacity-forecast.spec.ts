// KAN-79: capacity forecast (2-4 week trend) on /availability. Business rules
// under test (the story's two acceptance criteria):
//   AC1 — a known future APPROVED-leave cluster shows the dip on exactly the
//         affected dates (not the days either side).
//   AC2 — a PENDING (not-yet-approved) request shows up in the "at risk"
//         series but never moves the "confirmed" (approved-only) one.
//
// Uses a fresh, test-controlled 2-report team (like availability.spec.ts) so
// the exact % figures are deterministic on this live, shared DB.
import { test, expect, type Page } from "@playwright/test";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, wireTeamLead, getUserIdByEmail } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Forecast-Pass1";
const PM = FIXED_USERS.projectManager;

function formatShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

async function makeTeamLead(page: Page, label: string): Promise<{ id: string; name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD, role: "team_lead" });
  const id = await getUserIdByEmail(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { id, name, email };
}

async function makeReport(page: Page, label: string, teamLeadId: string): Promise<{ name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD });
  await wireTeamLead(email, teamLeadId);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { name, email };
}

test("forecast shows an approved-leave dip on exactly its dates, and a pending request only in the at-risk series", async ({ page }) => {
  const tl = await makeTeamLead(page, "Forecast TL");
  const emp1 = await makeReport(page, "Forecast Emp Approved", tl.id); // will get a fully-approved leave cluster
  const emp2 = await makeReport(page, "Forecast Emp Pending", tl.id); // will leave a request pending

  // 2 headcount team. AC1 fixture: a 3-working-day APPROVED-leave cluster for
  // emp1, a few days out — confirmed should dip to 50% on exactly these 3
  // dates and nowhere else. AC2 fixture: emp2 additionally applies (and never
  // gets decided on) for just the FIRST day of that same cluster — so that one
  // day has BOTH a confirmed dip (emp1, approved) AND an extra at-risk-only
  // dip (emp2, pending): confirmed 50% / at-risk 0%, distinctly different.
  const cluster = pickWorkdayRange(3, 2);
  const pendingDay = cluster.from;

  // --- emp1: apply, then carry the request through to full approval ---
  await login(page, { email: emp1.email, password: PASSWORD });
  await applyLeave(page, {
    type: "Casual",
    from: cluster.from,
    to: cluster.to,
    teamLeadName: tl.name,
    projectManagerName: PM.name,
    reason: "KAN-79 forecast fixture — confirmed cluster",
  });
  await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await login(page, { email: tl.email, password: TEST_PASSWORD });
  await approvalCardFor(page, emp1.name).getByRole("button", { name: "Approve → L2" }).click();
  await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await login(page, { email: PM.email, password: TEST_PASSWORD });
  await approvalCardFor(page, emp1.name).getByRole("button", { name: "Approve (final)" }).click();
  await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // --- emp2: apply and STOP — the request stays pending (pending_l1), never decided ---
  await login(page, { email: emp2.email, password: PASSWORD });
  await applyLeave(page, {
    type: "Casual",
    from: pendingDay,
    to: pendingDay,
    teamLeadName: tl.name,
    projectManagerName: PM.name,
    reason: "KAN-79 forecast fixture — pending, not yet decided",
  });
  await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // --- TL views the forecast: 2 direct reports. ---
  await login(page, { email: tl.email, password: TEST_PASSWORD });
  await page.goto("/availability");
  await expect(page.getByText("Capacity forecast")).toBeVisible();

  // AC1: the confirmed (approved-only) series dips to 50% on all 3 cluster
  // dates — proven via each date's native <title> tooltip text (accessible
  // content on the SVG data point for that exact date).
  for (const iso of [cluster.from, cluster.to]) {
    const label = formatShort(iso);
    await expect(page.locator("title", { hasText: `${label} — confirmed: 50% available` })).toHaveCount(1);
  }
  // The "Lowest confirmed" callout names the FIRST day at that minimum —
  // cluster.from — pinning the dip to a specific, correct date, not just "some day".
  await expect(page.getByText(`Lowest confirmed: 50% on ${formatShort(cluster.from)}`)).toBeVisible();

  // AC2: on cluster.from, emp2's still-PENDING request adds an extra dip the
  // confirmed series never shows — at-risk drops all the way to 0% (both
  // reports out) while confirmed stays at 50% (only emp1's approved leave
  // counts). The two series are therefore visibly distinct on this date.
  await expect(
    page.locator("title", { hasText: `${formatShort(pendingDay)} — at risk: 0% available (1 pending request)` }),
  ).toHaveCount(1);
  await expect(page.getByText(`Lowest if pending approved: 0% on ${formatShort(pendingDay)}`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
});
