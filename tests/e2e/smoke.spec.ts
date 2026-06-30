import { test, expect } from "@playwright/test";

test("dashboard renders the benefit wallet", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText("Sports")).toBeVisible();
  await expect(page.getByText("Learning")).toBeVisible();
});

test("role switcher routes HR Head to the expense queue", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: "HR Head" }).click();
  await expect(page).toHaveURL(/\/expenses/);
  await expect(page.getByRole("heading", { name: "Expense approval queue" })).toBeVisible();
});

test("login page shows the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Login to your account")).toBeVisible();
});
