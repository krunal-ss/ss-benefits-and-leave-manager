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
- **Roles come from the authenticated user** (`users.role`). The sidebar identity + nav and module access derive from it; `canAccessPath` / `homeRouteFor` / `NAV_SECTIONS` in `src/server/users.ts` are the single access policy, enforced server-side by `requireAccess(path)` (`src/server/auth/current-user.ts`). Provider tree (`src/components/providers/`): Theme → Toast → Queues.
- **`QueuesProvider`** holds the mutable HR-claim list so the HR queue + its badge stay in sync as items are decided. (Leave/WFH approvals are real DB data now — see `src/server/manager/`.)
- **Data is currently mocked** in `src/server/*.ts`. DB/Supabase/Resend clients are lazy singletons (`getDb()`, `createSupabaseServerClient()`, `sendEmail()`) reading zod-validated env via `getEnv()` — so `pnpm build` never needs env; a feature only fails when its key is missing at runtime.
- **Design tokens** live in `src/app/globals.css` (shadcn/zinc CSS variables mapped into Tailwind v4 via `@theme inline`). Style with utilities (`bg-card`, `text-muted-foreground`), never hex — see the `design-system` skill.
- **Expense auto-verification** is the pure, explainable rule engine in `src/server/verification.ts` (+ optional Claude vision OCR parse).

## Skills available (load on demand)
- `nextjs-standards` — App Router / RSC / data-fetching conventions
- `design-system` — tokens, shadcn usage, UI/UX rules
- `e2e-testing` — how to write + what a Playwright test must satisfy
- `prd-to-stories` — turn a PRD section into JIRA-ready epics/stories/sub-tasks

## Hard rules
- Never auto-approve an expense whose verification was inconclusive — route to HR Head.
- Never deduct/restore a leave balance without writing an `AuditLog` row.
- Working-day counts must exclude weekends + configured holidays.
