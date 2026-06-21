# Implementation Decisions

Append-only record of meaningful execution-time decisions.

## Task 1 - Server Discovery & Review Scan

- Implemented nested `.gitignore` support by prefixing rules with their directory path before adding them to a single `ignore` matcher. This keeps traversal logic simple while still honoring per-directory ignore files during a depth-first walk.
- Kept `listFiles()` as a compatibility alias to `walkMarkdownFiles()` during Task 1 so existing server routes keep compiling until Task 2 swaps them to the new API.


## Task 2 - Server API & Watcher Update

- Switched the watcher's `.gitignore` matcher loading to synchronous filesystem reads at startup. The previous async preloading delayed the first event long enough to drop immediate watcher notifications; startup is a better place to pay that cost than the hot path.
- Allowed `/d/<path>.md` through the SPA fallback in `server/app.ts` even though the pathname ends with `.md`. Document routes now contain the real filename, so the old `extname()` guard would wrongly 404 valid client-side routes.

