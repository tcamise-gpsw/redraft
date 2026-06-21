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

- 2026-06-21 — Task 7: The apparent “wrong index” failure in the duplicate-quote test came from my own miscounting, not from the resolver. Re-checking the literal string before changing code saved unnecessary churn.
- 2026-06-21 — Task 7: Longest-common-substring alone was too brittle for fuzzy anchor recovery because inserted words collapse the score too far. A subsequence-based score matched the intended “lightly edited” behavior much better for proposal text.

- 2026-06-21 — Task 8: The `useComments` test wrapper had to avoid JSX because the approved path is a `.ts` test file. `createElement()` kept the test file valid without drifting from the plan.
- 2026-06-21 — Task 8: `scrollIntoView` is not available in jsdom by default, so ProposalView’s scroll-sync behavior needed an explicit stub in the integration test. That made the comment↔highlight coordination testable without a browser.

- 2026-06-21 — Task 9: The editor tests were easiest to keep deterministic by mocking `useNavigate` and `useToast` instead of asserting on route state. That made the save and conflict branches precise without dragging the whole router into every assertion.
- 2026-06-21 — Task 9: The proposal edit route needed to strip a trailing `/edit` from the wildcard route param before reconstructing the proposal path. Doing that once in the route kept the hook and editor contracts clean.

- 2026-06-21 — Task 10: GitHub content URLs in Octokit requests are URL-encoded, so the Playwright route handlers needed `decodeURIComponent(url)` before matching proposal paths. Matching the raw encoded URL made the E2E tests look like app regressions when the bug was just in the mocks.
- 2026-06-21 — Task 10: Browser E2E setup was the longest external dependency step because Playwright needed Chromium installed separately from the npm package. Once installed, the mocked-browser suite ran quickly and deterministically.
