// KAN-16: apply for leave/WFH with working-day calc & cancel.
import { test, expect } from "@playwright/test";
import { signup, uniqueEmail } from "./utils/auth-ui";
import { FIXED_USERS } from "./utils/fixtures";
import { pickWorkdayRange, pickRangeWithWorkdays } from "./utils/dates";
import { applyLeave } from "./utils/leave-ui";

const PASSWORD = "Leave-Pass1";
const TL = FIXED_USERS.teamLead.name;
const PM = FIXED_USERS.projectManager.name;

test("a 3-weekday Casual Leave request computes the correct working-day count and routes to the chosen Team Lead", async ({ page }) => {
  await signup(page, { name: "Sanya Rao", email: uniqueEmail("leave-basic"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(3);

  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL, projectManagerName: PM, reason: "Family function" });

  await expect(page.getByText(`Request submitted — sent to ${TL} (L1)`)).toBeVisible();
  const row = page.locator("table tbody tr").first();
  await expect(row).toContainText("Casual Leave");
  await expect(row).toContainText("Pending L1");
  await expect(row.locator("td").nth(2)).toHaveText("3");
});

test("requesting more Casual Leave days than the available balance flags the excess as Loss of Pay", async ({ page }) => {
  await signup(page, { name: "Farhan Ali", email: uniqueEmail("leave-lop"), password: PASSWORD });
  const { from, to } = pickRangeWithWorkdays(14); // fresh balance is exactly 12 days

  await applyLeave(page, { type: "Casual", from, to, teamLeadName: TL, projectManagerName: PM, reason: "Long personal trip" });

  await expect(page.getByText("2 day(s) over balance flagged LOP")).toBeVisible();
});

test("a WFH request does not deduct any balance and still routes for approval", async ({ page }) => {
  await signup(page, { name: "Ritu Desai", email: uniqueEmail("leave-wfh"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(2);

  await applyLeave(page, { type: "WFH", from, to, teamLeadName: TL, projectManagerName: PM, reason: "Home internet install window" });

  await expect(page.getByText(`Request submitted — sent to ${TL} (L1)`)).toBeVisible();
  await expect(page.getByText("2 day(s) over balance flagged LOP")).toHaveCount(0);
  const row = page.locator("table tbody tr").first();
  await expect(row).toContainText("Work from home");
  await expect(row).toContainText("Pending L1");
});

test("a second request overlapping an existing one is blocked before it can be submitted", async ({ page }) => {
  await signup(page, { name: "Vivek Nair", email: uniqueEmail("leave-overlap"), password: PASSWORD });
  const first = pickWorkdayRange(3, 10);
  await applyLeave(page, { type: "Casual", from: first.from, to: first.to, teamLeadName: TL, projectManagerName: PM, reason: "First request" });
  await expect(page.getByText(`Request submitted — sent to ${TL} (L1)`)).toBeVisible();

  // Overlaps the middle day of the first request.
  const middle = new Date(first.from);
  middle.setDate(middle.getDate() + 1);
  const overlapDay = middle.toISOString().slice(0, 10);

  await page.goto("/leave");
  await page.getByRole("button", { name: "Casual", exact: true }).click();
  const dateInputs = page.locator("input[type='date']");
  await dateInputs.nth(0).fill(overlapDay);
  await dateInputs.nth(1).fill(overlapDay);
  await page.locator("select").nth(0).selectOption({ label: TL });
  await page.locator("select").nth(1).selectOption({ label: PM });
  await page.getByPlaceholder("Add context for your approvers…").fill("Second request");

  await expect(page.getByText("You already have a leave/WFH request that covers one of these dates.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("an employee can cancel a pending request", async ({ page }) => {
  await signup(page, { name: "Ananya Ghosh", email: uniqueEmail("leave-cancel"), password: PASSWORD });
  const { from, to } = pickWorkdayRange(2);
  await applyLeave(page, { type: "Sick", from, to, teamLeadName: TL, projectManagerName: PM, reason: "Flu" });
  await expect(page.getByText(`Request submitted — sent to ${TL} (L1)`)).toBeVisible();

  await page.locator("table tbody tr").first().click();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await page.getByRole("button", { name: "Yes, cancel request" }).click();
  await expect(page.getByText("Request cancelled")).toBeVisible();

  await expect(page.locator("table tbody tr").first()).toContainText("Cancelled");
});
