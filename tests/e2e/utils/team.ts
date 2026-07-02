// KAN-77: small, test-controlled team fixtures — mirrors the pattern
// availability.spec.ts (KAN-75/76) uses for its own local helpers, factored
// out here so the staffing-guard spec doesn't need an exact headcount from
// the shared FIXED_USERS Team Lead (whose reports accumulate across every
// spec file/run against the live DB).
import type { Page } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./auth-ui";
import { wireTeamLead, getUserIdByEmail, setUserDepartment, setCriticalRole } from "./fixtures";

/** Sign up a fresh Team Lead and return their id + name, then sign back out. */
export async function makeTeamLead(page: Page, label: string, password: string): Promise<{ id: string; name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password, role: "team_lead" });
  const id = await getUserIdByEmail(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { id, name, email };
}

/** Sign up a fresh employee, wire their reporting line/department/critical-role flag, sign back out. */
export async function makeReport(
  page: Page,
  label: string,
  opts: { teamLeadId: string; password: string; department?: string; isCriticalRole?: boolean },
): Promise<{ name: string; email: string }> {
  const name = uniqueName(label);
  const email = uniqueEmail(label.toLowerCase().replace(/\s+/g, "-"));
  await signup(page, { name, email, password: opts.password });
  await wireTeamLead(email, opts.teamLeadId);
  if (opts.department) await setUserDepartment(email, opts.department);
  if (opts.isCriticalRole) await setCriticalRole(email, true);
  await page.getByRole("button", { name: "Sign out" }).click();
  return { name, email };
}
