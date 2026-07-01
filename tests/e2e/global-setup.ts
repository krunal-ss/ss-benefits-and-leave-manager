// Runs once before the whole Sprint 1 E2E suite. Puts the live Supabase
// project into a known state: base reference data, the 3 fixed approver
// accounts (Team Lead / Project Manager / HR Head can't self-signup with a
// privileged role), and the Sprint 1 default approval policy.
import { ensureBaseData, ensureFixedUsers, resetApprovalPolicy } from "./utils/fixtures";

/** DNS to the Supabase pooler is occasionally flaky (EAI_AGAIN) — retry, this is idempotent. */
async function withRetry(fn: () => Promise<void>, attempts = 3): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

export default async function globalSetup(): Promise<void> {
  await withRetry(async () => {
    await ensureBaseData();
    await ensureFixedUsers();
    await resetApprovalPolicy();
  });
}
