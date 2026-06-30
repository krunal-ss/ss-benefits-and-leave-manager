---
name: e2e-testing
description: Use when writing, reviewing, or fixing end-to-end tests, or when a feature/story is being marked done and needs test coverage. Triggers on Playwright tests under tests/e2e and on any request to verify a user flow works.
---

# E2E Testing (Playwright)

## When a story is "done" it has E2E coverage of its acceptance criteria
Map each AC in the PRD/story to at least one assertion.

## How to write a test here
- One spec per user flow (e.g., `tests/e2e/expense-submit.spec.ts`).
- Test as a real role: seed/login as Employee, TL, PM, or HR Head via the test auth helper.
- Assert on user-visible outcomes (status text, balance numbers, queue contents), not internals.
- Cover the unhappy path too: over-balance claim blocked, duplicate receipt blocked, rejection releases balance.

## Reusable flows to cover (from PRD)
- Expense: submit + auto-approve updates Available balance; failing claim lands in HR queue; reject releases balance.
- Leave: working-day calc excludes weekends/holidays; L1 approve → Pending L2; final approve updates calendar + balance; withdraw restores balance.

## Checker rubric (a test must satisfy ALL)
- [ ] Acts through the UI as a specific role
- [ ] Asserts the exact AC outcome (numbers/status), not just "page loaded"
- [ ] Includes at least one negative/edge case for the flow
- [ ] Independent (seeds its own data, cleans up) and deterministic (no fixed sleeps)

> Enforcement is a HOOK, not this skill: configure a Claude Code hook to run `pnpm e2e` (and lint) on relevant file writes so coverage is checked automatically rather than requested.
