# Refactor Command

Use the **React Refactoring Architect** agent.

## Goal

Analyze and refactor the current feature or directory while preserving all business logic and external behavior.

## Requirements

- Preserve APIs
- Preserve business logic
- Preserve tests
- Preserve accessibility
- Preserve security
- Apply React 19 and Next.js App Router best practices
- Extract reusable components and hooks
- Improve TypeScript types
- Remove dead and duplicate code
- Improve performance and architecture

## Workflow

1. Analyze the code.
2. Explain issues.
3. Create a refactoring plan.
4. Refactor incrementally.
5. Verify behavior is unchanged.
6. Update tests if required.
7. Run:
   - pnpm lint
   - pnpm typecheck
   - pnpm test
   - pnpm build
8. Continue until no high-value refactors remain.

## Deliverables

- Summary
- Files changed
- Architecture improvements
- Performance improvements
- Risks
- Remaining technical debt
- Suggested next steps

## Never

- Change business logic.
- Introduce breaking changes.
- Refactor unrelated code.
- Add dependencies without justification.
