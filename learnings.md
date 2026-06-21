# Learnings

- 2026-06-21 — Task 1: The first lint run failed because ESLint 9 does not load `.eslintrc.cjs` by default. Downgrading to ESLint 8 resolved the mismatch cleanly without changing the approved plan.
- 2026-06-21 — Task 1: The browser tool timed out with a harness-side `cmux socket response` error while opening the local dev URL. The app build itself succeeded; browser verification needs a retry rather than app changes.
