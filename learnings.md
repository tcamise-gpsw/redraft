# Learnings

- 2026-06-21 — Task 1: The first lint run failed because ESLint 9 does not load `.eslintrc.cjs` by default. Downgrading to ESLint 8 resolved the mismatch cleanly without changing the approved plan.
- 2026-06-21 — Task 1: The browser tool timed out with a harness-side `cmux socket response` error while opening the local dev URL. The app build itself succeeded; browser verification needs a retry rather than app changes.

- 2026-06-21 — Task 2: Vitest showed the GitHub client tests as passing while still exiting non-zero because `jsdom` was missing from devDependencies. The fix was to install `jsdom`; the tests themselves were already green.
- 2026-06-21 — Task 2: A bad structural edit briefly removed `validateAuth()` from `GitHubClient`. Re-reading the anchored range before the next edit caught it quickly and prevented the mistake from leaking into later tasks.

- 2026-06-21 — Task 3: Vitest’s jsdom environment still exposed `localStorage` as unavailable in this harness, so the auth tests needed an explicit in-memory `localStorage` stub via `vi.stubGlobal`. That keeps the tests deterministic across runner environments.
- 2026-06-21 — Task 3: The approved `src/hooks/useAuth.ts` path forced the provider implementation to avoid JSX. Using `createElement` kept the file extension stable and type-safe without bending the plan.

- 2026-06-21 — Task 4: The browser verification on `/#/settings` was the most reliable real-browser smoke check for the shell because it exercises the header, routing, and authenticated state without needing the proposal data layer yet.
- 2026-06-21 — Task 4: `useToast.ts` hit the same `.ts`-with-JSX constraint as `useAuth.ts`. Keeping the provider in a `.ts` file required a `createElement`-based return rather than renaming the file and drifting from the approved plan.

- 2026-06-21 — Task 5: Testing tree sort order against a flattened list was misleading once expanded child nodes were visible. The reliable assertion was to inspect only the immediate children of the root tree container.
- 2026-06-21 — Task 5: The create-proposal flow is easiest to test at the component level by mocking `GitHubClient` and asserting the exact normalized repo path and commit message. That keeps the hook contract simple and still proves the write behavior end to end.

- 2026-06-21 — Task 6: `react-markdown` escaped the injected `<mark>` tags until `rehype-raw` was added. For this MVP phase, raw HTML is intentional because the viewer is temporarily using HTML substitution instead of DOM-range highlights.
- 2026-06-21 — Task 6: TanStack Query treats `undefined` as an invalid query result, even for optional resources. The optional comments query had to normalize missing data to `null` to keep the test output clean and avoid runtime warnings.
