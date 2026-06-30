# SmartSense — Benefit Wallet + Leave / WFH Manager

Internal employee portal. Two modules on one auth + role model:

- **Benefit Wallet** — annual category-capped allowances (Sports ₹15,000, Learning ₹45,000 / FY). Submit expense + receipt → auto-verify → auto-approve or route to HR Head.
- **Leave & WFH Manager** — apply + multi-level approval (Team Lead → Project Manager) + team calendar.

This is the **frontend implementation** of the imported Claude Design comp (`design/source/Benefit Portal.dc.html`). Data is mocked in `src/server/`; the backend (Supabase + Drizzle + Resend) is not wired yet.

## Run

```bash
pnpm i
cp .env.example .env.local   # fill in Supabase / Resend / Anthropic keys
pnpm dev      # http://localhost:3000
pnpm build    # production build + typecheck + lint
```

The UI runs on mock data (`src/server/`) without any env vars. The keys above are
only needed once the DB / auth / email / OCR paths are wired in.

## Stack (per PRD §9 / CLAUDE.md)

- **Next.js** App Router + TypeScript (strict) + **Tailwind v4** + **shadcn/ui** conventions (`components.json`, `cn` via clsx + tailwind-merge).
- **Supabase** (Postgres + Auth + Storage) — clients in `src/server/supabase/{server,client}.ts`.
- **Drizzle** ORM — schema in `src/db/schema.ts`, client in `src/db/index.ts`, config in `drizzle.config.ts`.
- **Resend** email (`src/server/email`), **Claude API** receipt OCR/parse (`src/server/verification.ts`).
- **zod**-validated env (`src/lib/env.ts`), central **RBAC** (`src/server/auth/rbac.ts`).
- Tests: **Vitest** + Testing Library (unit/component), **Playwright** (E2E).

```bash
pnpm test                 # vitest (unit) — 19 tests across rbac, verification, working-days, format
pnpm db:generate          # drizzle: SQL migration from schema  (db:migrate / db:push / db:studio)
pnpm e2e                  # playwright (needs: pnpm exec playwright install chromium)
```

## Roles (prototype)

Use the **"Viewing as"** switcher in the top-right header to move between **Employee**, **Team Lead**, and **HR Head**. Each role lands on its own home and sees its own navigation. The selection (and light/dark theme) persists across refreshes via `localStorage`.

| Role | Screens |
|---|---|
| Employee | Dashboard, Submit expense (single / split + live check), Apply leave / WFH |
| Team Lead | Approvals (L1 → L2), Team calendar |
| HR Head | Expense queue + review drawer, Org calendar |

`/login` carries the auth flows (login / signup / forgot / reset). **Signup** lets a
user self-select a non-privileged role — Employee, Team Lead, or Project Manager (see
`SIGNUP_ROLES` in `src/server/users.ts`); HR Head and Admin are assigned manually. The
chosen role is whitelisted server-side in `resolveSignupRole`, so a tampered
`user_metadata.app_role` can never self-escalate.

## Sessions (access token + refresh)

Auth is Supabase's cookie-based sessions: a short-lived **access token** (JWT) plus an
auto-rotating **refresh token**. The access-token lifetime is set to **5 minutes**; when
it expires the refresh token is exchanged for a new one automatically — server-side on
every navigation (`src/server/supabase/middleware.ts` → `auth.getUser()`) and in open
tabs by `SupabaseSessionProvider`. A failed/expired refresh redirects to
`/login?redirectTo=<path>`, which returns the user to where they were after re-auth.

Set the 5-minute lifetime per environment:

- **Hosted project:** Supabase dashboard → **Authentication → Sessions/Tokens →
  "Access token (JWT) expiry" → `300`**.
- **Local `supabase start`:** captured in `supabase/config.toml` (`[auth] jwt_expiry = 300`).

## Structure

```
src/
  app/
    (app)/              # authenticated shell (sidebar + header)
      dashboard|submit|leave|approvals|calendar|expenses/page.tsx
    login/page.tsx      # auth (no shell)
    globals.css         # imported shadcn/zinc tokens → Tailwind v4 @theme
    layout.tsx          # Geist fonts + providers
  components/
    providers/          # theme, role, toast, queues (shared mutable state)
    shell/              # sidebar, header, app-shell, brand
    ui/                 # card, button, input, segmented, avatar, status-badge
    supabase/           # server + browser Supabase clients
    auth/rbac.ts        # capability + ownership checks
    email/              # Resend
    verification.ts     # PRD §4.3 rule engine + Claude OCR parse
    {users,benefits,leave,approvals,hr-queue,calendar}.ts  # mock data
  db/                   # Drizzle schema, client, migrations
  lib/                  # formatINR, working-days, env (zod)
tests/e2e/              # Playwright specs
docs/                   # PRD
design/source/          # the imported Claude Design comp + tokens (reference)
```

Design tokens, color usage, and conventions are documented in `.claude/skills/design-system/SKILL.md`.
