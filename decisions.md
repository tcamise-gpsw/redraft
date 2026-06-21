# Decisions

- 2026-06-21 — Task 1: Kept the initial scaffold intentionally small: Vite + React + TypeScript + Tailwind, with architecture and development details split into `docs/architecture.md` and `docs/development.md` while `README.md` stays concise and links outward. This matches the approved plan revision and keeps the root docs navigable.
- 2026-06-21 — Task 1: Used ESLint 8 instead of 9 because the approved scaffold specifies a `.eslintrc.cjs` workflow. This avoids flat-config migration churn during initial setup and keeps the lint command in `AGENTS.md` and the plan accurate.

- 2026-06-21 — Task 2: Kept the GitHub client browser-safe by using `TextEncoder`/`TextDecoder` plus `btoa`/`atob` for content encoding instead of Node `Buffer`. The app runs in GitHub Pages, so the client cannot depend on Node globals.
- 2026-06-21 — Task 2: Wrapped Octokit failures into explicit `AuthError`, `NotFoundError`, `ConflictError`, `RateLimitError`, and `NetworkError` classes at the client boundary. This keeps later hooks and components from branching on raw Octokit response shapes.
