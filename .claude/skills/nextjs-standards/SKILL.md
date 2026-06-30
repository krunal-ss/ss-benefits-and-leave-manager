---
name: nextjs-standards
description: Use when writing, reviewing, or refactoring any Next.js (App Router) or React code in this repo — pages, routes, server/client components, data fetching, layouts, loading/error boundaries, or API route handlers. Triggers on .tsx/.ts work under src/app or src/components.
---

# Next.js / React Standards

## Component model
- Default to **Server Components**. Add `"use client"` ONLY for: local state, effects, event handlers, browser APIs.
- Never fetch data or touch the DB inside a Client Component. Fetch in a Server Component or a Server Action and pass props down.
- Keep client bundles small: push interactivity to leaf components.

## Data fetching
- Read data in Server Components via functions in `src/server/`.
- Mutations via Server Actions or route handlers in `src/app/api/`, always validating input (zod) and enforcing RBAC + ownership before any DB call.
- Use `loading.tsx` and `error.tsx` boundaries per route segment.

## Conventions
- TypeScript strict. No `any`. Share types from `src/server` and `src/db`.
- Money is integer paise. Dates are stored UTC, displayed in IST.
- Co-locate route-only components under the route; shared ones go in `src/components/`.

## Checklist before "done"
- [ ] Correct server/client split (no needless `"use client"`)
- [ ] Input validated + RBAC/ownership enforced on every mutation
- [ ] Loading + error states handled
- [ ] No DB access from client code
