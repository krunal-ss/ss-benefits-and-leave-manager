# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Benefit Wallet + Leave/WFH Manager.**

> Project memory. Keep this SHORT and STABLE: facts and conventions, not procedures.
> If an entry grows into a multi-step "how to", promote it into a Skill under `.claude/skills/`.

## What this project is

Internal employee portal, two modules sharing one auth + role model:

- **Benefit Wallet:** annual category-capped allowances (Sports ₹15,000, Learning ₹45,000 per FY). Submit expense + receipt → auto-verify → auto-approve or route to HR Head → reimburse at FY-end.
- **Leave & WFH Manager:** KEKA-style apply + multi-level approval (Team Lead → Project Manager) + email notifications.

Roles: Employee, Team Lead, Project Manager, HR Head (+ optional Admin). Reporting lines are DATA, never hard-coded.

## Stack (authoritative)

- Frontend: Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui
- DB: Supabase (Postgres + Auth + Storage + RLS) <!-- swap target: Neon + Better Auth -->
- ORM: Drizzle
- Email: Resend
- Tests: Playwright (E2E), Vitest + Testing Library (unit/component)
- Currency: INR. Financial year: 1 Apr – 31 Mar.

## Commands

- Install `pnpm i` · Dev `pnpm dev` · Build (also runs typecheck + lint) `pnpm build`
- Unit (Vitest): `pnpm test` · watch `pnpm test:watch` · one file `pnpm test src/server/verification.test.ts` · one case `pnpm test -t "fails on a duplicate"`
- E2E: `pnpm e2e` (one-time first: `pnpm exec playwright install chromium`)
- DB (Drizzle, needs `DATABASE_URL`): `pnpm db:generate` (SQL from schema) → `pnpm db:migrate` / `pnpm db:push` / `pnpm db:studio`

## Repo conventions

- Package manager: pnpm.
- App Router: prefer Server Components; mark Client Components with `"use client"` only when needed (state, effects, browser APIs).
- Data access goes through `src/server/` (never query the DB from a Client Component).
- Every API/route enforces RBAC AND ownership (an Employee sees only their own data; a TL only their reports).
- Money stored as integer paise; never floats.
- Uploaded documents: object storage + signed URLs only. Never public.

## Folder map

- `src/app/(app)/` — authenticated routes; `src/app/login/` — auth (outside the shell)
- `src/components/` — `providers/`, `shell/` (sidebar+header), `ui/` (primitives)
- `src/server/` — services + mock data: `auth/rbac.ts`, `supabase/`, `email/`, `verification.ts`
- `src/db/` — Drizzle schema, lazy client, `migrations/`
- `src/lib/` — `env.ts` (zod), `format.ts`, `working-days.ts`, `cn.ts`
- `tests/e2e/` — Playwright · `design/source/` — imported Claude Design comp · `.claude/docs/` — PRDs (Benefit Wallet + Leave Manager, Smart Team Availability & Capacity Planner, AI Expense Verification & Receipt Intelligence, Productivity & Usability Enhancements, Employee Experience Enhancements)
- `.claude/skills/` — project skills (see below)

## Architecture (big picture)

- **Screens are role-scoped routes** under `src/app/(app)/`, wrapped by the shell in `(app)/layout.tsx` (employee: dashboard/submit/leave · TL: approvals/calendar · HR: expenses/calendar). `/` redirects to `/dashboard`.
- **Roles come from the authenticated user** (`users.role`). The sidebar identity + nav and module access derive from it; `canAccessPath` / `homeRouteFor` / `NAV_SECTIONS` in `src/server/users.ts` are the single access policy, enforced server-side by `requireAccess(path)` (`src/server/auth/current-user.ts`). Provider tree (`src/components/providers/`): Supabase session → Theme → Toast.
- **HR expense queue is real DB data** — `src/server/hr/expenses.ts` reads `pending_hr` claims; `src/server/actions/decide-expense.ts` approves/rejects (audit + email). Leave/WFH approvals are real DB data too — see `src/server/manager/`.
- **Employee dashboard is real DB data** — `src/server/employee/dashboard.ts` (`getDashboardData`) and `src/server/employee/balances.ts` (`getCategoryBalances`) query `benefitClaims`/`benefitCategories`/`leaveBalances`/`leaveRequests` directly; `src/server/benefits.ts` holds only shared types + the pure `available()` helper, no mock data. DB/Supabase/Resend clients are lazy singletons (`getDb()`, `createSupabaseServerClient()`, `sendEmail()`) reading zod-validated env via `getEnv()` — so `pnpm build` never needs env; a feature only fails when its key is missing at runtime.
- **Design tokens** live in `src/app/globals.css` (shadcn/zinc CSS variables mapped into Tailwind v4 via `@theme inline`). Style with utilities (`bg-card`, `text-muted-foreground`), never hex — see the `design-system` skill.
- **Expense auto-verification** is the pure, explainable rule engine in `src/server/verification.ts` (+ optional Claude vision OCR parse). Shared with `src/server/actions/draft-expense.ts`'s draft-finalize path via `src/server/expense-pipeline.ts` (`verifyAndScoreClaim`) — don't duplicate the OCR/dupe-check/rule-engine/AI-score logic in a new action, call the pipeline.
- **`benefitClaims.categoryId`/`amountPaise`/`expenseDate` are nullable** (KAN-125) so a `draft`-status row can hold only some fields; required-ness is enforced at the application layer only when a draft transitions to `submitted`, never at the DB layer. Any new read of these columns must account for `null` (see the `!`/`?? 0` guards already in `hr/expenses.ts`, `dashboard.ts`, `balances.ts` — each justified by a status filter that excludes `draft`).
- **HR-only settings screens** live under `src/app/(app)/settings/<name>/` (e.g. `settings/approvals`, `settings/staffing-thresholds`), gated `hr_head`/`admin` in `MODULE_ACCESS`, backed by a single/multi-row config table + audited server action — see `staffingThreshold` (KAN-74, minimum team-availability % consumed later by the Capacity Planner epic) for the latest example.
- **`teamCapacitySnapshot`** (KAN-79) is populated daily by a Vercel Cron job (`vercel.json` → `GET /api/cron/capacity-snapshot`, authenticated via `CRON_SECRET`) that calls `writeCapacitySnapshot` (`src/server/manager/capacity-forecast.ts`) once per scope through `src/server/manager/capacity-snapshot-job.ts` (org + every department + every manager's team) — it is still not read by the live 2-4 week forecast on `/availability` (that stays computed on the fly from `leaveRequests`); a future story must add the historical-trend UI that reads this table.
- **Low-staffing email alerts** (KAN-81, `src/server/manager/capacity-alert.ts`) piggyback on that same daily job: right after each org/department-scope snapshot write, `checkLowStaffingAndNotify` compares `capacityPercent` against the KAN-74 threshold (department override wins, else org default — "team" scope has no threshold and is never checked) and, on a breach, emails every `hr_head` (CC'd with the department's `team_lead`/`project_manager` users for a department breach). Dedup is a subject-string lookup against `emailLog` (`` `Low staffing alert: ${scopeLabel} on ${date}` ``, `template: "low_staffing_alert"`) — one email per scope+date, no separate alert-log table.
- **Cancelling an already-`approved` leave** (KAN-127, `src/server/actions/cancel-approved-leave.ts`) is a separate flow from the existing cancel-while-`pending` withdraw in `cancel-leave.ts`. Whether it needs the original approver's sign-off (`cancellation_requested` status, decided via `decideLeaveCancellationAction`) or applies immediately is the `requireLeaveCancellationApproval` toggle on the KAN-46 `approval_policy` row (Settings → Approvals) — never hardcoded. A pending cancellation isn't final, so `getOutToday`, availability's confirmed-only pass, and HR reporting all still treat `cancellation_requested` as "on leave"/"approved" until the decision lands.
- **`rejected` is no longer always a terminal status** (KAN-126, Claim Resubmission). `resubmitClaimAction` (`src/server/actions/resubmit-claim.ts`) lets the owning employee edit a `rejected` claim and re-run it through `verifyAndScoreClaim` — under the SAME `benefitClaims` row/id, never a new claim. The pre-edit state is snapshotted to `benefit_claim_versions` before the edit lands; a claim's "version number" (1 = never resubmitted) is always DERIVED as `(snapshot count for that claimId) + 1`, never stored redundantly on `benefitClaims`. `getClaimVersionHistory` (`src/server/hr/expenses.ts`) is the HR-side read, folded into `getReceiptIntelligence`'s `versionHistory`; `version` is also carried on `QueuedClaim`/`DecidedClaim`/`MyClaim` for list-view badges. Any future code that branches on `status === "rejected"` being a dead end (e.g. treating it like `reimbursed` as fully final) must account for it being reopened.
- **The AI score/verdict is surfaced everywhere a claim is listed, not just the Receipt Intelligence screen** (KAN-113). `getHrExpenseQueue` left-joins `receiptVerifications` so `QueuedClaim.aiScore`/`aiVerdict` are populated for the HR queue table and its review drawer (`AiScoreBadge`, `src/components/ui/ai-score-badge.tsx`), each linking through to `/expenses/[claimId]/intelligence` for the full breakdown. The verdict → color/label mapping lives once in `src/lib/verdict-style.ts` (`VERDICT_META`) — the queue badge, review drawer, and Receipt Intelligence screen all import it; don't redefine the mapping locally in a new surface.
- **Employee Experience Enhancements (KAN-145)** shipped three additive features, all deliberately scoped to UI/config only — no automated cron/email fan-out yet:
  - **Wallet Transaction History** (KAN-146) is a DERIVED ledger, not a new table: `getWalletLedger` (`src/server/employee/ledger.ts`) synthesizes one FY-allocation credit per category plus one reserved/debit/released event per non-draft claim (same `APPROVED`/`PENDING` status sets as `balances.ts`), sorted with a running balance. Surfaced as a "Ledger" view alongside `MyClaims` on `/submit` (`wallet-ledger.tsx`); CSV export is a pure client-side Blob download, no new route.
  - **Approval SLA Timer** (KAN-147) is pure math in `src/server/sla.ts` (`computeSla`/`summarizeSla`, target 48h for expenses / 24h for leave, deliberately dependency-free so it's importable from both server and the ticking `<SlaBadge>` client component) layered onto the EXISTING `getApprovalQueue`/`getHrExpenseQueue` results (`createdAt` passed through raw, never pre-computed into a frozen label). The escalation copy on overdue rows is informational text only — no cron/email escalation is wired up (that remains a follow-up).
  - **Remaining Benefit Reminder** (KAN-148) added `benefitReminderSettings` (single-row config, same lazily-defaulted pattern as `approvalPolicy`) driving both the HR `/reminders` settings screen and the employee dashboard banner (`src/server/employee/reminder-banner.ts`, reusing `getCategoryBalances` — no new balance math). The audience count is one aggregate query, not one `getCategoryBalances` call per user. "Send test to me" sends a real one-off email; there is no scheduled per-employee reminder job yet (also a follow-up).

## Skills available (load on demand)

- `nextjs-standards` — App Router / RSC / data-fetching conventions
- `design-system` — tokens, shadcn usage, UI/UX rules
- `e2e-testing` — how to write + what a Playwright test must satisfy
- `prd-to-stories` — turn a PRD section into JIRA-ready epics/stories/sub-tasks

## Hard rules

- Never auto-approve an expense whose verification was inconclusive — route to HR Head.
- Never deduct/restore a leave balance without writing an `AuditLog` row.
- Working-day counts must exclude weekends + configured holidays.

## Available Agents

- React Refactoring Architect (`.claude/agents/react-refactoring-architect.md`) — component/hook quality and Next.js/React best practices; standards live in the agent file itself, not duplicated here.
