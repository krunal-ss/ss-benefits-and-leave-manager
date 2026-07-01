import type { Page } from "@playwright/test";

export type LeaveTypeLabel = "Casual" | "Sick" | "Earned" | "Loss of Pay" | "WFH";

/** Fills and submits the /leave apply form. Leaves the page on /leave afterwards. */
export async function applyLeave(
  page: Page,
  opts: {
    type: LeaveTypeLabel;
    from: string;
    to: string;
    halfDay?: boolean;
    teamLeadName: string;
    projectManagerName: string;
    reason: string;
  },
): Promise<void> {
  await page.goto("/leave");
  await page.getByRole("button", { name: opts.type, exact: true }).click();

  const dateInputs = page.locator("input[type='date']");
  await dateInputs.nth(0).fill(opts.from);
  await dateInputs.nth(1).fill(opts.to);
  if (opts.halfDay) await page.locator("button[role='switch']").click();

  const selects = page.locator("select");
  await selects.nth(0).selectOption({ label: opts.teamLeadName });
  await selects.nth(1).selectOption({ label: opts.projectManagerName });

  await page.getByPlaceholder("Add context for your approvers…").fill(opts.reason);
  await page.getByRole("button", { name: "Submit request" }).click();
}
