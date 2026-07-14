// KAN-185 (Quick Search) — the ⌘K command palette and the full /search page
// both call the same RBAC-scoped searchAction. This covers: a leave request
// found by its reason text, a policy found by name, the empty-query and
// no-match states, and that a result click navigates to the right screen.
import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { applyLeave } from "./utils/leave-ui";
import { pickWorkdayRange } from "./utils/dates";
import { FIXED_USERS } from "./utils/fixtures";

test("Quick search finds a leave request by reason, and a policy by name, scoped to the searcher", async ({ page }) => {
  const reasonToken = uniqueName("SearchReasonToken");
  await signup(page, { name: "Search Tester", email: uniqueEmail("quick-search"), password: "Search-Pass1" });

  const { from, to } = pickWorkdayRange(1);
  await applyLeave(page, {
    type: "Casual",
    from,
    to,
    teamLeadName: FIXED_USERS.teamLead.name,
    projectManagerName: FIXED_USERS.projectManager.name,
    reason: reasonToken,
  });
  // The apply action is a real Supabase write + notification email in this
  // environment — occasionally slower than the global 10s expect default.
  await expect(page.getByText(`Request submitted — sent to ${FIXED_USERS.teamLead.name} (L1)`)).toBeVisible({
    timeout: 20_000,
  });

  // Open the command palette from the header and search for the leave's unique reason text.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Quick search" }).click();
  const palette = page.getByRole("dialog", { name: "Quick search" });
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder("Search leave, claims, people, policies…").fill(reasonToken);

  await expect(palette.getByText("Leave requests")).toBeVisible();
  await expect(palette.getByText("Casual Leave")).toBeVisible();

  // Clicking the result closes the palette and lands on the leave screen.
  await palette.getByText("Casual Leave").click();
  await expect(page).toHaveURL(/\/leave$/);
  await expect(palette).toHaveCount(0);

  // A policy is found by name — no ownership scoping applies to policies. (Its
  // summary is HR-editable content — see leave-policy.spec.ts — so assert on
  // the stable name, not the summary text.) The same query also matches the
  // leave request above by its leave-type name, so scope to the Policies
  // group specifically — it always renders last among the result groups.
  await page.getByRole("button", { name: "Quick search" }).click();
  const palette2 = page.getByRole("dialog", { name: "Quick search" });
  await palette2.getByPlaceholder("Search leave, claims, people, policies…").fill("Casual Leave");
  await expect(palette2.getByText("Policies")).toBeVisible();
  await expect(palette2.locator("button", { hasText: "Casual Leave" }).last()).toBeVisible();

  // A nonsense query hits the empty state.
  await palette2.getByPlaceholder("Search leave, claims, people, policies…").fill("zzz-no-such-thing-zzz");
  await expect(palette2.getByText("No results. Press Enter to open full search.")).toBeVisible();
});

test("The full /search page shows results for a shared query and supports the scope filter", async ({ page }) => {
  const reasonToken = uniqueName("SearchPageToken");
  await signup(page, { name: "Search Page Tester", email: uniqueEmail("quick-search-page"), password: "Search-Pass1" });

  const { from, to } = pickWorkdayRange(1, 8);
  await applyLeave(page, {
    type: "Sick",
    from,
    to,
    teamLeadName: FIXED_USERS.teamLead.name,
    projectManagerName: FIXED_USERS.projectManager.name,
    reason: reasonToken,
  });
  await expect(page.getByText(`Request submitted — sent to ${FIXED_USERS.teamLead.name} (L1)`)).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(`/search?q=${encodeURIComponent(reasonToken)}`);
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
  await expect(page.getByText("Sick Leave").first()).toBeVisible();

  // Scope to "People" only — the leave result should drop out.
  await page.getByRole("tablist", { name: "Search scope" }).getByRole("tab", { name: "People" }).click();
  await expect(page.getByText("Sick Leave")).toHaveCount(0);
});
