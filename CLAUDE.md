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
- DB: Supabase (Postgres + Auth + Storage + RLS)   <!-- swap target: Neon + Better Auth -->
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
- `tests/e2e/` — Playwright · `design/source/` — imported Claude Design comp · `docs/` — PRD
- `.claude/skills/` — project skills (see below)

## Architecture (big picture)
- **Screens are role-scoped routes** under `src/app/(app)/`, wrapped by the shell in `(app)/layout.tsx` (employee: dashboard/submit/leave · TL: approvals/calendar · HR: expenses/calendar). `/` redirects to `/dashboard`.
- **Roles come from the authenticated user** (`users.role`). The sidebar identity + nav and module access derive from it; `canAccessPath` / `homeRouteFor` / `NAV_SECTIONS` in `src/server/users.ts` are the single access policy, enforced server-side by `requireAccess(path)` (`src/server/auth/current-user.ts`). Provider tree (`src/components/providers/`): Supabase session → Theme → Toast.
- **HR expense queue is real DB data** — `src/server/hr/expenses.ts` reads `pending_hr` claims; `src/server/actions/decide-expense.ts` approves/rejects (audit + email). Leave/WFH approvals are real DB data too — see `src/server/manager/`.
- **Some employee dashboard figures are still mocked** in `src/server/benefits.ts`. DB/Supabase/Resend clients are lazy singletons (`getDb()`, `createSupabaseServerClient()`, `sendEmail()`) reading zod-validated env via `getEnv()` — so `pnpm build` never needs env; a feature only fails when its key is missing at runtime.
- **Design tokens** live in `src/app/globals.css` (shadcn/zinc CSS variables mapped into Tailwind v4 via `@theme inline`). Style with utilities (`bg-card`, `text-muted-foreground`), never hex — see the `design-system` skill.
- **Expense auto-verification** is the pure, explainable rule engine in `src/server/verification.ts` (+ optional Claude vision OCR parse).
- **HR-only settings screens** live under `src/app/(app)/settings/<name>/` (e.g. `settings/approvals`, `settings/staffing-thresholds`), gated `hr_head`/`admin` in `MODULE_ACCESS`, backed by a single/multi-row config table + audited server action — see `staffingThreshold` (KAN-74, minimum team-availability % consumed later by the Capacity Planner epic) for the latest example.
- **`teamCapacitySnapshot`** (KAN-79) is populated daily by a Vercel Cron job (`vercel.json` → `GET /api/cron/capacity-snapshot`, authenticated via `CRON_SECRET`) that calls `writeCapacitySnapshot` (`src/server/manager/capacity-forecast.ts`) once per scope through `src/server/manager/capacity-snapshot-job.ts` (org + every department + every manager's team) — it is still not read by the live 2-4 week forecast on `/availability` (that stays computed on the fly from `leaveRequests`); a future story must add the historical-trend UI that reads this table.

## Skills available (load on demand)
- `nextjs-standards` — App Router / RSC / data-fetching conventions
- `design-system` — tokens, shadcn usage, UI/UX rules
- `e2e-testing` — how to write + what a Playwright test must satisfy
- `prd-to-stories` — turn a PRD section into JIRA-ready epics/stories/sub-tasks

## Hard rules
- Never auto-approve an expense whose verification was inconclusive — route to HR Head.
- Never deduct/restore a leave balance without writing an `AuditLog` row.
- Working-day counts must exclude weekends + configured holidays.
