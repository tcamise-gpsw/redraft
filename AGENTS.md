# AGENTS

## Project intent

Build the ReDraft MVP described in `docs/specs/2025-06-21-proposal-review-core-design.md`, extended by the local-mode and AI workflow design in `docs/specs/2026-06-21-local-mode-ai-skills-design.md`.

## Commands

- Dev server: `npm run dev`
- Build: `npm run build`
- Local server: `npm run serve`
- Test: `npx vitest run`
- Lint: `npx eslint src/ server/`
- Type check: `npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json`
- Format check: `npx prettier --check src/ server/`
- E2E: `npx playwright test`

## Structure

- `src/components/auth/` — PAT entry, auth gate
- `src/components/layout/` — shell, header, layout tests
- `src/components/tree/` — document navigation tree, under-review list, and create dialog
- `src/components/document/` — MilkdownDocument (view/WYSIWYG/raw), activity indicator, milkdown plugins
- `src/components/comments/` — sidebar threads and forms
- `src/components/ui/` — shared primitives (button, dialog, spinner, toast)
- `src/lib/github/` — GitHub REST client, typed errors, rate-limit/auth events
- `src/lib/comments/` — anchor resolution and fuzzy matching
- `src/hooks/` — auth, document loading, document editing, comments, toast state, local file watcher bridge
- `src/types/` — shared domain interfaces
- `server/` — local Hono server, filesystem adapter, git convenience routes, watcher, WebSocket hub, CLI
- `.agents/skills/` — project-local OMP skills
- `docs/` — architecture, development notes, specs, and plans

## Conventions

- TypeScript strict mode stays enabled.
- Prefer focused components with one clear responsibility.
- Keep GitHub API behavior inside `src/lib/github/`.
- Keep local server logic inside `server/`.
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
- Do not invent alternate storage paths for document content.
- Do not bypass SHA checks when writing document or comment files.
- Do not bypass the auth/rate-limit event path when changing `GitHubClient` behavior.
- Do not make git commits a required part of local ReDraft editing; git remains a convenience layer, not a gate.
