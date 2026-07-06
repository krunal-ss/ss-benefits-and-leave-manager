---
name: prd-to-stories
description: Use when breaking down the PRD (or any feature/epic) into a backlog — generating JIRA-ready epics, user stories, and sub-tasks, or when the user mentions sprint planning, backlog, stories, or syncing work to JIRA.
---

# PRD → Stories → Sub-tasks

## Output format
For each epic, produce stories; for each story, produce sub-tasks and acceptance criteria.

**Epic:** `<E#> <name>` — one-line goal. Maps to a JIRA Epic.

**Story:** `As a <role>, I can <capability> so that <value>.`
- Acceptance criteria: reference the PRD AC IDs (e.g., §4.5 AC1–AC3).
- Estimate: S / M / L.

**Sub-tasks** (always split along these lines so subagents can run in parallel):
- DB: schema/migration
- BE: endpoint/service + validation + RBAC
- FE: screen/component
- QA: Playwright E2E for the ACs
- Docs: update CLAUDE.md/skill if a new convention emerged

## Rules
- Every story is a vertical slice that delivers user-visible value.
- Every story's QA sub-task lists which ACs it verifies.
- Keep stories ≤ ~1 sprint; if bigger, split.
- After drafting, sync to JIRA via the Atlassian MCP connector: create the Epic, then Stories under it, then Sub-tasks under each Story; set status as work progresses.

## Source of truth
PRDs live in `.claude/docs/`. The original backlog (epics E0–E6) is derived from `PRD-Benefit-Wallet-and-Leave-Manager.md` §11 — start there for that scope. Later feature PRDs, each mapped to its own epic:
- `PRD-Smart-Team-Availability-Capacity-Planner.md` → epic KAN-73
- `PRD-AI-Expense-Verification-Receipt-Intelligence.md` → epic KAN-110
- `PRD-Productivity-Usability-Enhancements.md` → epic KAN-124 (Expense Draft Save, Claim Resubmission, Leave Cancellation Request)
