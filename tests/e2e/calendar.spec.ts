// KAN-17: team calendar (leave/WFH/holidays) with role scoping + month nav.
// Calendar visibility is scoped by users.teamLeadId/projectManagerId (the
// employee's reporting line), NOT by the per-request approver choice — so the
// employee fixture here must be wired via wireReportingLine before applying.
import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { signup, login, uniqueEmail } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, getUserIdByEmail, wireReportingLine } from "./utils/fixtures";
import { schema, testDb } from "./utils/db";
import { pickWorkday, pickWorkdayRange } from "./utils/dates";
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

test("clicking a leave entry on the calendar opens its detail with status and approval trail", async ({ page }) => {
  // The calendar label only ever shows the FIRST name (see src/server/calendar.ts) —
  // the random suffix must be on the first word itself, or repeat runs on the same
  // live DB (which can land on the same calendar day) collide on "Devika · CL".
  const employeeName = `Devika${Math.floor(Math.random() * 1e6)} Rao`;
  const employeeEmail = uniqueEmail("cal-detail");
  await signup(page, { name: employeeName, email: employeeEmail, password: PASSWORD });
  await wireReportingLine(employeeEmail);

  const { from, to } = pickWorkdayRange(1, 9);
  await applyLeave(page, {
    type: "Casual",
    from,
    to,
    teamLeadName: FIXED_USERS.teamLead.name,
    projectManagerName: FIXED_USERS.projectManager.name,
    reason: "Detail modal check",
  });
  await expect(page.getByText(`Request submitted — sent to ${FIXED_USERS.teamLead.name} (L1)`)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
  await page.goto(`/calendar?m=${from.slice(0, 7)}`);

  await page.getByText(`${employeeName.split(" ")[0]} · CL`).click();
  const dialog = page.getByRole("dialog", { name: "Leave detail" });
  await expect(dialog.getByText(employeeName)).toBeVisible();
  await expect(dialog.getByText("Pending L1")).toBeVisible();
  await expect(dialog.getByText("L1 · Team Lead")).toBeVisible();
  await expect(dialog.getByText("Awaiting decision")).toBeVisible();
  await expect(dialog.getByText("Not yet reached")).toBeVisible();
});

test("a day with more than 5 leaves collapses to a '+N more' overlay, and an entry inside it opens the same detail view", async ({ page }) => {
  const db = testDb();
  const tlId = await getUserIdByEmail(FIXED_USERS.teamLead.email);
  const pmId = await getUserIdByEmail(FIXED_USERS.projectManager.email);
  const [clType] = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.code, "CL")).limit(1);
  const day = pickWorkday(60); // far enough out to avoid other specs' seeded ranges

  // Same first-word-collision concern as above — the suffix goes on the first word.
  const names = Array.from({ length: 6 }, (_, i) => `Overflow${i}${Math.floor(Math.random() * 1e6)} Test`);
  const userIds: string[] = [];
  for (const [i, name] of names.entries()) {
    const [u] = await db
      .insert(schema.users)
      .values({
        name,
        email: uniqueEmail(`cal-overflow-${i}`),
        role: "employee",
        teamLeadId: tlId,
        projectManagerId: pmId,
      })
      .returning();
    userIds.push(u.id);
  }

  // First request is already past L1, so the detail view has a real approval to show.
  const [approvedAtL1] = await db
    .insert(schema.leaveRequests)
    .values({
      userId: userIds[0],
      kind: "leave",
      leaveTypeId: clType.id,
      fromDate: day,
      toDate: day,
      workingDays: "1",
      reason: "Overflow fixture",
      status: "pending_l2",
      currentLevel: 2,
      teamLeadId: tlId,
      projectManagerId: pmId,
    })
    .returning();
  await db.insert(schema.approvals).values({
    requestId: approvedAtL1.id,
    level: 1,
    approverId: tlId,
    decision: "approved",
    reason: "Covered by the team",
  });

  for (const uid of userIds.slice(1)) {
    await db.insert(schema.leaveRequests).values({
      userId: uid,
      kind: "leave",
      leaveTypeId: clType.id,
      fromDate: day,
      toDate: day,
      workingDays: "1",
      reason: "Overflow fixture",
      status: "pending_l1",
      currentLevel: 1,
      teamLeadId: tlId,
      projectManagerId: pmId,
    });
  }

  await login(page, { email: FIXED_USERS.teamLead.email, password: TEST_PASSWORD });
  await page.goto(`/calendar?m=${day.slice(0, 7)}`);

  const moreLink = page.getByRole("button", { name: /more/ });
  await expect(moreLink).toBeVisible();
  await moreLink.click();

  const overview = page.getByRole("dialog", { name: /Leaves on/ });
  for (const name of names) {
    await expect(overview.getByText(`${name.split(" ")[0]} · CL`)).toBeVisible();
  }

  await overview.getByText(`${names[0].split(" ")[0]} · CL`).click();
  const detail = page.getByRole("dialog", { name: "Leave detail" });
  await expect(detail.getByText(names[0])).toBeVisible();
  await expect(detail.getByText("Pending L2")).toBeVisible();
  await expect(detail.getByText(/^Approved/)).toBeVisible();
  await expect(detail.getByText("Covered by the team")).toBeVisible();
});
