# AGENTS

## Project intent

Build the Proposal Review Workspace MVP described in `docs/specs/2025-06-21-proposal-review-core-design.md` and executed through `PLAN.md`.

## Commands

- Dev server: `npm run dev`
- Build: `npm run build`
- Test: `npx vitest run`
- Lint: `npx eslint src/`
- Type check: `npx tsc --noEmit`
- Format check: `npx prettier --check src/`
- E2E: `npx playwright test`

## Structure

- `src/components/` — UI by feature area, not by generic abstraction
- `src/lib/` — shared logic modules with no React rendering
- `src/hooks/` — React hooks for data access and local UI state
- `src/types/` — domain interfaces shared across hooks and components
- `docs/` — architecture, development notes, and specs

## Conventions

- TypeScript strict mode stays enabled.
- Prefer focused components with one clear responsibility.
- Keep GitHub API behavior inside `src/lib/github/`.
- Keep anchor-matching logic inside `src/lib/comments/`.
- Use TanStack Query for server state, React state for local interaction state.
- Update README and docs when architecture or commands change.

## Testing expectations

- Follow TDD for feature work: write the failing test first, observe failure, then implement.
- Use Vitest for unit and hook coverage.
- Use Playwright in a real browser for interactive verification as tasks land.
- Do not merge behavior changes without matching tests and command verification.

## Common pitfalls

- Do not leak the GitHub PAT into source, logs, or committed files.
- Do not invent alternate storage paths for proposal content.
- Do not bypass SHA checks when writing proposal or comment files.
- Do not introduce a backend or server-side auth flow.
