---
name: design-system
description: Use when building or styling any UI in this repo — creating components, choosing colors/spacing/typography, applying Tailwind classes, or adding shadcn/ui components. Triggers on visual/layout work and any new screen or component.
---

# Design System

> Tokens below are imported from the Claude Design project ("Benefit Portal") — the shadcn/ui
> visual system (Tailwind v4 defaults). They live as CSS variables in `src/app/globals.css`
> (`:root` = light, `.dark` = dark). Reference them via Tailwind utilities (`bg-card`,
> `text-muted-foreground`, `border-border`, `rounded-lg`) — never hard-code hex.
> Reference Anthropic's bundled `frontend-design` skill for principles on distinctive, non-templated design.

## Tokens (imported — shadcn/ui · zinc base)
- Primary color: `--primary` = zinc-900 `#18181b` (light) / zinc-50 `#fafafa` (dark); foreground `--primary-foreground` inverts.
- Neutral/surface scale: **zinc** — `--background` #fff / zinc-950 `#09090b`; `--card`, `--muted` zinc-100 `#f4f4f5` / zinc-800 `#27272a`; `--border`/`--input` zinc-200 `#e4e4e7` / white-10%; `--muted-foreground` zinc-500 `#71717a` / zinc-400 `#a1a1aa`.
- Success: emerald-500 `#10b981` · Warning: amber-500 `#f59e0b` (dark text on amber uses `#b45309`) · Danger: `--destructive` `#e7000b` (light) / `#ff6467` (dark), raw red-600 `#dc2626`.
- Category / status accents: **Sports** emerald-500 · **Learning** blue-600 `#2563eb` · **WFH** violet-600 `#7c3aed` · **Leave** blue-600 · **Holiday** amber-500. Tint surfaces with `color-mix(in oklab, <accent> N%, transparent)`.
- Font family (UI / headings): **Geist** (`--font-sans`); mono code: **Geist Mono** (`--font-mono`). Headings: weight 600, negative letter-spacing.
- Spacing scale: Tailwind default (4px base) unless overridden. Use arbitrary values (e.g. `text-[23px]`) only to match the imported comps.
- Radius: `--radius` `0.625rem` (10px) → `rounded-lg`; sm 6px / md 8px / xl 14px. Pills `rounded-full`.
- Shadows: Tailwind v4 scale `--shadow-xs … --shadow-2xl`; cards use `shadow-xs`, popovers/drawers `shadow-sm`/`shadow-2xl`.

## Rules
- Use shadcn/ui components first; only build custom when shadcn has no fit.
- Use Tailwind utility classes; do not write ad-hoc CSS files.
- Consistent spacing rhythm; avoid one-off pixel values.
- All interactive elements: visible focus state, accessible labels, 44px min touch target.
- Tables/queues (HR approval queue, manager leave queue) must support empty, loading, and error states.

## UX patterns specific to this app
- Balance widgets always show Allocated / Used / Available.
- Approval queues show the key fields inline so a decision needs no extra clicks.
- Every destructive/approval action has a confirmation + reason field where the PRD requires a reason.

## Checklist
- [ ] Uses tokens above (no hard-coded hex/spacing)
- [ ] Empty / loading / error states present
- [ ] Keyboard accessible + labeled
