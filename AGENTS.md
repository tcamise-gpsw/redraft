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

- `src/components/auth/` — PAT entry, auth gate
- `src/components/layout/` — shell, header, layout tests
- `src/components/tree/` — proposal navigation tree and create dialog
- `src/components/document/` — MilkdownDocument (view/WYSIWYG/raw), activity indicator, milkdown plugins
- `src/components/comments/` — sidebar threads and forms
- `src/components/ui/` — shared primitives (button, dialog, spinner, toast)
- `src/lib/github/` — GitHub REST client, typed errors, rate-limit/auth events
- `src/lib/comments/` — anchor resolution and fuzzy matching
- `src/hooks/` — auth, proposal loading, proposal editing, comments, toast state
- `src/types/` — shared domain interfaces
- `docs/` — architecture, development notes, and specs

## Conventions

- TypeScript strict mode stays enabled.
- Prefer focused components with one clear responsibility.
- Keep GitHub API behavior inside `src/lib/github/`.
- Keep anchor-matching logic inside `src/lib/comments/`.
- Keep ProseMirror plugins inside `src/components/document/milkdown/`.
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
- Do not bypass the auth/rate-limit event path when changing `GitHubClient` behavior.
