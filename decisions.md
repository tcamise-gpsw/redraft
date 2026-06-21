# Decisions

- 2026-06-21 — Task 1: Kept the initial scaffold intentionally small: Vite + React + TypeScript + Tailwind, with architecture and development details split into `docs/architecture.md` and `docs/development.md` while `README.md` stays concise and links outward. This matches the approved plan revision and keeps the root docs navigable.
- 2026-06-21 — Task 1: Used ESLint 8 instead of 9 because the approved scaffold specifies a `.eslintrc.cjs` workflow. This avoids flat-config migration churn during initial setup and keeps the lint command in `AGENTS.md` and the plan accurate.
