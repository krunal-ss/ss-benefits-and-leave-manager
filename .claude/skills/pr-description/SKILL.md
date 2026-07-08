---
name: pr-description
description: Use when drafting or updating a pull request title/description for this repo — opening a new PR, filling in `gh pr create --body`, or when the user asks to "write the PR description" / "summarize this branch for review". Triggers whenever a PR is about to be created or its description revised.
---

# PR Description

## Gather context first
- `git log main...HEAD --oneline` and `git diff main...HEAD --stat` — full set of commits/files in the PR, not just the latest commit.
- Branch name and commit prefixes for the ticket key (`feat/kan-113-...`, `feat(KAN-113): ...`) — every PR maps to one JIRA epic/story (see `.claude/docs/` PRDs and the `prd-to-stories` skill).
- Whether `CLAUDE.md` was touched in the diff — if the branch introduced a new convention/architecture note, that doc update belongs in the summary, not silently folded in.

## Title
`<type>(KAN-<id>[,KAN-<id>]): <imperative summary>` — same grammar as this repo's commit subjects (`feat`, `fix`, `refactor`, `docs`). Keep under 70 characters.

## Body shape
```
## Summary
- <why, not what — the driving constraint/decision, then the resulting behavior>
- <call out any hard rule from CLAUDE.md this touches: RBAC/ownership, paise-not-floats,
  audit logging on leave-balance changes, draft-row nullability>

## Verification
- <what was checked non-breaking / backwards compatible, e.g. "verified against every existing caller">
- <manual check performed, if any, as a specific role>

## Test plan
- [ ] `pnpm test` — <specific new/changed spec files>
- [ ] `pnpm e2e` — <specific new/changed spec files under tests/e2e>
- [ ] Manual: <flow>, as <role>
```
Favor the "why" framing already used in this repo's merge commits (e.g. `210051c`) over a bare file-by-file changelog — a reviewer should understand the decision, not just the diff.

## Rules
- Never invent a KAN ticket — if the branch/commits don't reference one, ask rather than guess.
- If the diff spans multiple ticket keys (squashed/combined branch), list all of them in the title, one Summary bullet per ticket.
- Skip empty sections rather than writing "N/A" — a docs-only PR has no Test plan checklist beyond typecheck/lint.
- Creating or updating a live PR (`gh pr create`, `gh pr edit`) is a visible, shared-state action — draft the description, show it to the user, and only run the `gh` command after they confirm (per the repo-wide git safety rules), unless they've explicitly asked you to just create it.
