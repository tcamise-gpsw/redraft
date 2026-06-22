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

## Task 4 - Frontend Document UI & Routing

- Dropped the old optimistic `setQueryData()` insert from the create-dialog flow. The tree query now returns a structured `{ documents, underReview }` payload, so invalidating and reloading is safer than trying to hand-maintain two sections client-side.
- Kept the route component file as `src/routes/ProposalView.tsx` for now to avoid a same-name collision with `src/components/document/DocumentView.tsx`, but switched the actual route path and data flow to the document model (`/d/*`, root-relative document paths, `DocumentTree`).

## Task 5 - E2E & Final Validation

- Kept the checked-in `proposals/` directory only as sample fixture content for Playwright's local workspace bootstrap. Production behavior no longer depends on that path; the config just copies representative markdown into a throwaway repo-root workspace.
- Switched the remote comment E2E from "new selection comment" to "reply on an existing thread" because the latter is more deterministic under automation while still proving that comment mutations target `.redraft/comments/...`.
