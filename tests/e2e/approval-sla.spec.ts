// KAN-147 — Approval SLA Timer. Covers the live countdown/elapsed badge on
// both the HR expense queue and a leave/WFH approval card, plus the "on
// track/due soon/overdue" summary bar counts on each page. This pass is
// informational-only (no cron/escalation email — see CLAUDE.md), so the
// escalation banner text is asserted as static copy, not a side effect.
import { test, expect, type Page } from "@playwright/test";
import { login, logout, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, ensureReceiptsBucket, backdateNewestPendingClaim, backdateNewestPendingLeaveRequest } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "SlaTimer-Pass1";
const today = new Date().toISOString().slice(0, 10);
const TL = FIXED_USERS.teamLead;
const PM = FIXED_USERS.projectManager;

const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let storageReady = false;
test.beforeAll(async () => {
  storageReady = await ensureReceiptsBucket();
});
test.beforeEach(() => {
  test.skip(
    !storageReady,
    "Supabase Storage unreachable in this environment — receipt upload needs the Storage endpoint reachable from the app + test runner.",
  );
});

/** Same shape as expense-queue-ai-score.spec.ts's fixture: no ANTHROPIC_API_KEY here, so verification fails and the claim lands in pending_hr. */
async function submitPendingClaim(page: Page, opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string }) {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.locator("input[type='file']").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX_BASE64, "base64"),
  });
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();
}

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

test.describe("HR expense queue SLA", () => {
  test("a freshly submitted claim shows a live 'left' badge and the Review SLA summary bar", async ({ page }) => {
    const applicantName = uniqueName("Farhan Sheikh");
    await signup(page, { name: applicantName, email: uniqueEmail("sla-hr-ok"), password: PASSWORD });
    await submitPendingClaim(page, { category: "Sports", amountRupees: 1200, vendor: "Decathlon" });
    await logout(page);

    await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
    await page.goto("/expenses");

    // Summary bar above the table — "Review SLA" + at least the pill counts.
    await expect(page.getByText("Review SLA")).toBeVisible();
    await expect(page.getByText(/on track/)).toBeVisible();
    await expect(page.getByText(/due soon/)).toBeVisible();
    await expect(page.getByText(/overdue/)).toBeVisible();

    // Per-row SLA badge — a fresh claim is well within the 48h window.
    const row = page.locator("table tbody tr", { hasText: applicantName });
    await expect(row.getByText(/left$/)).toBeVisible();
  });

  test("a claim backdated past the 48h SLA shows 'Overdue by …' and the escalation note", async ({ page }) => {
    const applicantEmail = uniqueEmail("sla-hr-over");
    const applicantName = uniqueName("Zoya Ahmed");
    await signup(page, { name: applicantName, email: applicantEmail, password: PASSWORD });
    await submitPendingClaim(page, { category: "Learning", amountRupees: 2500, vendor: "Skillshare" });
    await logout(page);

    // Arrangement only (per db.ts's rubric) — no UI flow can push a claim's
    // createdAt into the past, so this is the one place a real DB write is needed.
    await backdateNewestPendingClaim(applicantEmail, 50); // 2h past the 48h target

    await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
    await page.goto("/expenses");

    const row = page.locator("table tbody tr", { hasText: applicantName });
    await expect(row.getByText(/^Overdue by/)).toBeVisible();
    await expect(page.getByText("Overdue claims escalate to HR Head")).toBeVisible();
  });
});

test.describe("Leave/WFH approval SLA", () => {
  test("a freshly submitted request shows a live SLA row with the L1 target label and the SLA status bar", async ({ page }) => {
    const name = uniqueName("Devika Rao");
    await signup(page, { name, email: uniqueEmail("sla-appr-ok"), password: PASSWORD });
    const { from, to } = pickWorkdayRange(2, 6);
    await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "SLA check" });
    await logout(page);

    await login(page, { email: TL.email, password: TEST_PASSWORD });
    await page.goto("/approvals");

    await expect(page.getByText("SLA status")).toBeVisible();
    await expect(page.getByText(/on track/)).toBeVisible();

    const card = approvalCardFor(page, name);
    await expect(card.getByText(/left$/)).toBeVisible();
    await expect(card.getByText("L1 · 24h SLA")).toBeVisible();
  });

  test("a request backdated past the 24h SLA shows 'Overdue by …' and the auto-escalation banner", async ({ page }) => {
    const email = uniqueEmail("sla-appr-over");
    const name = uniqueName("Kabir Malhotra");
    await signup(page, { name, email, password: PASSWORD });
    const { from, to } = pickWorkdayRange(2, 7);
    await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL.name, projectManagerName: PM.name, reason: "SLA breach check" });
    await logout(page);

    await backdateNewestPendingLeaveRequest(email, 25); // 1h past the 24h L1 target

    await login(page, { email: TL.email, password: TEST_PASSWORD });
    await page.goto("/approvals");

    const card = approvalCardFor(page, name);
    await expect(card.getByText(/^Overdue by/)).toBeVisible();
    await expect(card.getByText("SLA breached")).toBeVisible();
    await expect(card.getByText("Project Manager (L2)")).toBeVisible();
  });
});
