# Implementation Decisions

Append-only record of meaningful execution-time decisions.

## Task 1 - Server Discovery & Review Scan

- Implemented nested `.gitignore` support by prefixing rules with their directory path before adding them to a single `ignore` matcher. This keeps traversal logic simple while still honoring per-directory ignore files during a depth-first walk.
- Kept `listFiles()` as a compatibility alias to `walkMarkdownFiles()` during Task 1 so existing server routes keep compiling until Task 2 swaps them to the new API.


## Task 2 - Server API & Watcher Update

- Switched the watcher's `.gitignore` matcher loading to synchronous filesystem reads at startup. The previous async preloading delayed the first event long enough to drop immediate watcher notifications; startup is a better place to pay that cost than the hot path.
- Allowed `/d/<path>.md` through the SPA fallback in `server/app.ts` even though the pathname ends with `.md`. Document routes now contain the real filename, so the old `extname()` guard would wrongly 404 valid client-side routes.


## Task 3 - Frontend Data Layer & GitHub Tree

- Kept local tree loading out of `GitHubClient` and fetched the structured local tree response directly inside `useDocuments()`. Remote mode still uses `GitHubClient.getTree()`, while local mode can consume the custom `{ documents, underReview }` payload without weakening the GitHub client contract.
- Updated the existing proposal-oriented components to import the renamed hooks and types immediately. That let Task 3 delete the old files without leaving the app in a non-compiling intermediate state while the Task 4 UI rewrite is still pending.
