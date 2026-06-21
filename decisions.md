# Decisions

- 2026-06-21 — Task 1: Kept the initial scaffold intentionally small: Vite + React + TypeScript + Tailwind, with architecture and development details split into `docs/architecture.md` and `docs/development.md` while `README.md` stays concise and links outward. This matches the approved plan revision and keeps the root docs navigable.
- 2026-06-21 — Task 1: Used ESLint 8 instead of 9 because the approved scaffold specifies a `.eslintrc.cjs` workflow. This avoids flat-config migration churn during initial setup and keeps the lint command in `AGENTS.md` and the plan accurate.

- 2026-06-21 — Task 2: Kept the GitHub client browser-safe by using `TextEncoder`/`TextDecoder` plus `btoa`/`atob` for content encoding instead of Node `Buffer`. The app runs in GitHub Pages, so the client cannot depend on Node globals.
- 2026-06-21 — Task 2: Wrapped Octokit failures into explicit `AuthError`, `NotFoundError`, `ConflictError`, `RateLimitError`, and `NetworkError` classes at the client boundary. This keeps later hooks and components from branching on raw Octokit response shapes.

- 2026-06-21 — Task 3: Kept auth state in a dedicated `AuthProvider`/`useAuth` pair, but stored the provider in `src/hooks/useAuth.ts` without JSX by returning `createElement`. That preserves the approved file path while keeping the auth boundary centralized for later routing work.
- 2026-06-21 — Task 3: Added `AUTH_ERROR_EVENT` plus `dispatchAuthError()` as the minimal cross-cutting hook for later 401 recovery. It avoids coupling the GitHub client directly to React state while still letting the app clear stored auth on unauthorized responses.

- 2026-06-21 — Task 4: Kept the shell route placeholders intentionally thin (`Home`, `ProposalView`, `ProposalEdit`) and pushed shared chrome into `AppLayout` + `Header`. That preserves the feature-area route structure from the plan without over-abstracting before the data layers land.
- 2026-06-21 — Task 4: Toast state lives in a dedicated provider instead of inside `App.tsx`, and the QueryClient is created from inside a component that can call `showToast`. This keeps TanStack Query error reporting aligned with the approved architecture while avoiding global singleton state.

- 2026-06-21 — Task 5: Built the proposal tree directly from the flat Git tree API response inside `useProposals()` instead of inventing an intermediate service layer. The hook is the only consumer right now, so the tree normalization stays close to the query boundary and remains easy to replace if GitHub path semantics need to change.
- 2026-06-21 — Task 5: Kept folder nodes expanded by default so nested proposals are immediately visible in the sidebar. The recursive `TreeNode` still owns expand/collapse state per directory, so the UX can be tightened later without changing the hook contract.

- 2026-06-21 — Task 6: For the first viewer slice, comment highlighting uses simple quote replacement plus raw-markdown rendering instead of a DOM-range overlay system. That matches the plan’s temporary exact-match requirement and keeps the real anchoring complexity isolated to Task 7.
- 2026-06-21 — Task 6: `useProposal()` loads content, optional comments, and latest commit as separate queries so later invalidation can stay surgical. The viewer only depends on the merged shape, not on how many underlying requests produced it.

- 2026-06-21 — Task 7: Kept anchor resolution as a pure text engine with no DOM dependencies. The viewer and sidebar can both consume the same `resolveAnchor()` result later, which keeps anchoring behavior consistent across rendering and comment ordering.
- 2026-06-21 — Task 7: Fuzzy matching uses subsequence-based similarity with the existing substring helper as a lower-level signal. That is permissive enough to survive small inserted words while still rejecting unrelated text below the 0.7 threshold.

- 2026-06-21 — Task 8: Kept `useComments()` narrowly responsible for GitHub reads/writes and mutation invalidation, while the sidebar owns user-facing toast behavior. That keeps the hook reusable in other surfaces without hard-wiring UI state into the data layer.
- 2026-06-21 — Task 8: `ProposalView` now owns active comment selection and the scroll bridge between the document and sidebar. The document emits comment IDs and selection payloads; the sidebar consumes ordered threads and mutation helpers; the route coordinates both.

- 2026-06-21 — Task 9: Kept the editor route thin by reusing `useProposal()` for reads and isolating write behavior in `useProposalEdit()`. The route only coordinates loading, save state, and navigation, which keeps the editor itself reusable and easy to test.
- 2026-06-21 — Task 9: Conflict handling in the edit hook matches the comments flow’s user-facing message, even though the underlying signals still come from GitHub SHA failures. That keeps the UI consistent across document edits and comment mutations.

- 2026-06-21 — Task 10: Used mocked GitHub API responses in Playwright rather than live GitHub state for the E2E suite. The browser is still real, but the API layer becomes deterministic enough to exercise auth, proposal loading, comments, editing, and conflict handling without depending on mutable remote repo state.
- 2026-06-21 — Task 10: Simplified route selection by handling `/proposals/*` in one place and switching between `ProposalView` and `ProposalEdit` based on `location.pathname.endsWith('/edit')`. This is more reliable than trying to make a splat route match with a trailing literal segment.
