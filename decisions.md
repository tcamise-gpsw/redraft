# Decisions

- 2026-06-21 — Task 1: Kept the initial scaffold intentionally small: Vite + React + TypeScript + Tailwind, with architecture and development details split into `docs/architecture.md` and `docs/development.md` while `README.md` stays concise and links outward. This matches the approved plan revision and keeps the root docs navigable.
- 2026-06-21 — Task 1: Used ESLint 8 instead of 9 because the approved scaffold specifies a `.eslintrc.cjs` workflow. This avoids flat-config migration churn during initial setup and keeps the lint command in `AGENTS.md` and the plan accurate.

- 2026-06-21 — Task 2: Kept the GitHub client browser-safe by using `TextEncoder`/`TextDecoder` plus `btoa`/`atob` for content encoding instead of Node `Buffer`. The app runs in GitHub Pages, so the client cannot depend on Node globals.
- 2026-06-21 — Task 2: Wrapped Octokit failures into explicit `AuthError`, `NotFoundError`, `ConflictError`, `RateLimitError`, and `NetworkError` classes at the client boundary. This keeps later hooks and components from branching on raw Octokit response shapes.

- 2026-06-21 — Task 3: Kept auth state in a dedicated `AuthProvider`/`useAuth` pair, but stored the provider in `src/hooks/useAuth.ts` without JSX by returning `createElement`. That preserves the approved file path while keeping the auth boundary centralized for later routing work.
- 2026-06-21 — Task 3: Added `AUTH_ERROR_EVENT` plus `dispatchAuthError()` as the minimal cross-cutting hook for later 401 recovery. It avoids coupling the GitHub client directly to React state while still letting the app clear stored auth on unauthorized responses.

- 2026-06-21 — Task 4: Kept the shell route placeholders intentionally thin (`Home`, `ProposalView`, `ProposalEdit`) and pushed shared chrome into `AppLayout` + `Header`. That preserves the feature-area route structure from the plan without over-abstracting before the data layers land.
- 2026-06-21 — Task 4: Toast state lives in a dedicated provider instead of inside `App.tsx`, and the QueryClient is created from inside a component that can call `showToast`. This keeps TanStack Query error reporting aligned with the approved architecture while avoiding global singleton state.
