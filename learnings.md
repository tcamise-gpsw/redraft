# Implementation Learnings

Append-only record of surprises, bugs, and useful discoveries during execution.

## Task 1 - Server Discovery & Review Scan

- `localeCompare()` sorted `docs/visible.md` before `README.md`, so tests that care about output order need to assert the actual sorted order rather than assume root files appear first.
- Splitting `.redraft/` handling into two paths matters: the document walk must exclude it entirely, while the review scanner must recurse into `.redraft/comments/` explicitly.

## Task 2 - Server API & Watcher Update

- The server-side SPA fallback had assumed route paths would never contain file extensions. Once document URLs started embedding the actual markdown path, `extname(pathname) !== ''` became a false negative for valid app routes.
- Watcher tests with fake timers surfaced a real timing issue: async ignore-matcher warmup can drop the very first filesystem event if it arrives before matcher resolution.

## Task 3 - Frontend Data Layer & GitHub Tree

- `lsp rename_file` moved the hook/type files cleanly but did not rewrite the import sites in this workspace. A follow-up search for the old module paths was still necessary to get the frontend compiling again.
- The remote `underReview` story is trickier than local mode because the repo tree alone does not expose unresolved counts cheaply. For the POC, checking for optional `.redraft/comments/...` files per document and setting `unresolvedCount: 0` is enough to light up the review bucket without introducing a second GitHub tree API contract.
