// KAN-80: filters (role / leave type / date range) on the availability
// heatmap, and CSV export of the currently applied filters.
//
// Business rules under test (the story's two acceptance criteria):
//   AC1 — role/leave-type/date-range filters narrow the heatmap consistently
//         (a role filter shrinks the resolved team; a leave-type filter only
//         counts requests of that type as "on leave"; a date-range filter
//         narrows which days are computed, leaving days outside it blank).
//   AC2 — the exported CSV matches the currently applied filters, and a
//         Team Lead can never export another manager's team by passing a
//         different teamId (RBAC/ownership, same as the interactive view).
//
// Uses a fresh, test-controlled team (like availability.spec.ts) so the
// exact figures are deterministic on this live, shared DB.
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { signup, login, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, wireTeamLead, getUserIdByEmail } from "./utils/fixtures";
import { pickWorkdayRange } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";
import { testDb, schema } from "./utils/db";

const PASSWORD = "Export-Pass1";
const PM = FIXED_USERS.projectManager;

async function leaveTypeIdByCode(code: string): Promise<string> {
  const db = testDb();
  const [row] = await db
    .select({ id: schema.leaveTypes.id })
    .from(schema.leaveTypes)
    .where(eq(schema.leaveTypes.code, code))
    .limit(1);
  if (!row) throw new Error(`Leave type ${code} not seeded — did global setup run?`);
  return row.id;
}

async function makeTeamLead(page: Page, label: string): Promise<{ id: string; name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD, role: "team_lead" });
  const id = await getUserIdByEmail(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { id, name, email };
}

/** Like makeReport in utils/team.ts, but lets the report itself hold a non-employee role — needed to exercise the KAN-80 role filter. */
async function makeReportWithRole(
  page: Page,
  label: string,
  opts: { teamLeadId: string; role?: "employee" | "team_lead" | "project_manager" },
): Promise<{ name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: PASSWORD, role: opts.role === "employee" ? undefined : opts.role });
  await wireTeamLead(email, opts.teamLeadId);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { name, email };
}

function approvalCardFor(page: Page, employeeName: string) {
  return page
    .locator("div")
    .filter({ hasText: employeeName })
    .filter({ has: page.getByRole("button", { name: "Reject" }) })
    .last();
}

test.describe("Availability filters + CSV export (KAN-80)", () => {
  test("role, leave-type, and date-range filters narrow the heatmap to the fixture subset, and Export CSV matches the applied filters", async ({
    page,
  }) => {
    const clId = await leaveTypeIdByCode("CL");
    const slId = await leaveTypeIdByCode("SL");

    const tl = await makeTeamLead(page, "KAN80 TL");
    const emp = await makeReportWithRole(page, "KAN80 Emp", { teamLeadId: tl.id, role: "employee" });
    // A second report who happens to hold the team_lead role elsewhere — lets
    // the role filter meaningfully narrow this team from 2 members to 1.
    await makeReportWithRole(page, "KAN80 Lead Report", { teamLeadId: tl.id, role: "team_lead" });

    const { from: leaveDay, to: otherDay } = pickWorkdayRange(3);
    const month = leaveDay.slice(0, 7);

    // emp applies + gets a full-day Casual Leave (CL) approved for leaveDay.
    await login(page, { email: emp.email, password: PASSWORD });
    await applyLeave(page, {
      type: "Casual",
      from: leaveDay,
      to: leaveDay,
      teamLeadName: tl.name,
      projectManagerName: PM.name,
      reason: "KAN-80 filter fixture",
    });
    await expect(page.getByText(`Request submitted — sent to ${tl.name} (L1)`)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, { email: tl.email, password: TEST_PASSWORD });
    await approvalCardFor(page, emp.name).getByRole("button", { name: "Approve → L2" }).click();
    await expect(page.getByText("Approved at L1 — forwarded to Project Manager")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, { email: PM.email, password: TEST_PASSWORD });
    await approvalCardFor(page, emp.name).getByRole("button", { name: "Approve (final)" }).click();
    await expect(page.getByText("Fully approved — calendar updated, applicant notified")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await login(page, { email: tl.email, password: TEST_PASSWORD });

    // Baseline (no filters): 2 direct reports, 1 out on leaveDay -> 50%.
    await page.goto(`/availability?m=${month}`);
    await expect(page.getByText("2 direct reports")).toBeVisible();
    await expect(page.getByText("50%", { exact: true })).toBeVisible();

    // AC1a — role filter: only the "employee" report counts -> 1 direct
    // report, and since that one report is out, the day drops to 0%.
    await page.goto(`/availability?m=${month}&role=employee`);
    await expect(page.getByText("1 direct report", { exact: true })).toBeVisible();
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await expect(page.getByText("50%", { exact: true })).toHaveCount(0);

    // AC1b — leave-type filter set to a DIFFERENT type (SL) than the actual
    // request (CL): nothing counts as "on leave" for this view -> full 100%.
    await page.goto(`/availability?m=${month}&leaveType=${slId}&date=${leaveDay}`);
    const selectedCard = page.getByRole("group", { name: "Selected day capacity summary" });
    await expect(selectedCard.getByText("100%", { exact: true })).toBeVisible();
    await expect(selectedCard.getByText("0 on leave")).toBeVisible();

    // Leave-type filter set to the MATCHING type (CL): back to the 50% baseline.
    await page.goto(`/availability?m=${month}&leaveType=${clId}&date=${leaveDay}`);
    await expect(selectedCard.getByText("50%", { exact: true })).toBeVisible();
    await expect(selectedCard.getByText("1 on leave")).toBeVisible();

    // AC1c — date-range filter: narrowing the fetched window to exactly
    // leaveDay leaves days outside it blank ("Non-working day"), while
    // leaveDay itself still shows its real figure.
    await page.goto(`/availability?m=${month}&from=${leaveDay}&to=${leaveDay}&date=${otherDay}`);
    await expect(selectedCard.getByText("Non-working day")).toBeVisible();
    await page.goto(`/availability?m=${month}&from=${leaveDay}&to=${leaveDay}&date=${leaveDay}`);
    await expect(selectedCard.getByText("50%", { exact: true })).toBeVisible();

    // AC2 — Export CSV matches the currently applied filters (role=employee,
    // leaveType=CL, range clipped to exactly leaveDay): 1 headcount, 1 on
    // leave, 0 available, 0%.
    await page.goto(`/availability?m=${month}&role=employee&leaveType=${clId}`);
    await page.locator("#availabilityFromFilter").fill(leaveDay);
    await page.locator("#availabilityToFilter").fill(leaveDay);
    expect(page.url()).toContain(`from=${leaveDay}`);
    expect(page.url()).toContain(`to=${leaveDay}`);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Download stream unavailable.");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString("utf-8");

    const rows = csv.trim().split(/\r\n/);
    expect(rows[0]).toBe("Date,Headcount,On Leave,WFH,Available,Available %");
    expect(rows).toContain(`${leaveDay},1,1,0,0,0`);

    await page.getByRole("button", { name: "Sign out" }).click();
  });

  test("a Team Lead exporting can never pull another manager's team, and department-scope is refused", async ({ page }) => {
    const owner = await makeTeamLead(page, "KAN80 Owner TL");
    await makeReportWithRole(page, "KAN80 Owner Report", { teamLeadId: owner.id, role: "employee" });
    await makeReportWithRole(page, "KAN80 Owner Report Two", { teamLeadId: owner.id, role: "employee" });

    const outsider = await makeTeamLead(page, "KAN80 Outsider TL");
    await makeReportWithRole(page, "KAN80 Outsider Report", { teamLeadId: outsider.id, role: "employee" });

    const { from, to } = pickWorkdayRange(1);

    await login(page, { email: outsider.email, password: TEST_PASSWORD });

    // Even though the request body names the OTHER team lead's id, the
    // server ignores it for a Team Lead and scopes to the caller's own team
    // (1 report) — never the owner's (2 reports).
    const csv = await page.evaluate(
      async ({ teamId, from, to }) => {
        const res = await fetch("/api/availability/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "team", teamId, fromDate: from, toDate: to }),
        });
        return { status: res.status, body: await res.text() };
      },
      { teamId: owner.id, from, to },
    );
    expect(csv.status).toBe(200);
    const rows = csv.body.trim().split(/\r\n/);
    expect(rows[1].split(",")[1]).toBe("1"); // outsider's own headcount, not owner's

    // A Team Lead is never HR Head/Admin — department scope must be refused.
    const deptResult = await page.evaluate(
      async ({ from, to }) => {
        const res = await fetch("/api/availability/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "department", department: "Engineering", fromDate: from, toDate: to }),
        });
        return res.status;
      },
      { from, to },
    );
    expect(deptResult).toBe(403);

    await page.getByRole("button", { name: "Sign out" }).click();
  });
});
