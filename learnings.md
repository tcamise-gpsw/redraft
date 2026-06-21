# Learnings

- 2026-06-21 — Task 1: The first lint run failed because ESLint 9 does not load `.eslintrc.cjs` by default. Downgrading to ESLint 8 resolved the mismatch cleanly without changing the approved plan.
- 2026-06-21 — Task 1: The browser tool timed out with a harness-side `cmux socket response` error while opening the local dev URL. The app build itself succeeded; browser verification needs a retry rather than app changes.

- 2026-06-21 — Task 2: Vitest showed the GitHub client tests as passing while still exiting non-zero because `jsdom` was missing from devDependencies. The fix was to install `jsdom`; the tests themselves were already green.
- 2026-06-21 — Task 2: A bad structural edit briefly removed `validateAuth()` from `GitHubClient`. Re-reading the anchored range before the next edit caught it quickly and prevented the mistake from leaking into later tasks.

- 2026-06-21 — Task 3: Vitest’s jsdom environment still exposed `localStorage` as unavailable in this harness, so the auth tests needed an explicit in-memory `localStorage` stub via `vi.stubGlobal`. That keeps the tests deterministic across runner environments.
- 2026-06-21 — Task 3: The approved `src/hooks/useAuth.ts` path forced the provider implementation to avoid JSX. Using `createElement` kept the file extension stable and type-safe without bending the plan.
