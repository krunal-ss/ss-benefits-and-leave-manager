import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // These tests run against a real Supabase project (real network round-trips
  // for every auth/DB call), and several chain many logins + page loads in a
  // single test (e.g. the L1->L2 approval flow) — the 30s default is too tight.
  timeout: 90_000,
  // This project's Supabase instance has default (low) auth rate limits —
  // concurrent signup/login/reset calls across workers trip them and make
  // otherwise-correct tests flake. Run serially until a dedicated test
  // project with higher limits is available.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // The shared dev Supabase project's default auth rate limits occasionally
  // throttle a signup/login call even with serial execution — retry rather
  // than flake, since a real selector/logic bug fails the same way every time.
  retries: 2,
  expect: {
    // Mutating server actions do a real DB transaction + revalidate against
    // the remote Supabase project — the 5s default is occasionally too tight.
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
