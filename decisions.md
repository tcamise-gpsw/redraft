# Implementation Decisions

Append-only record of meaningful execution-time decisions.

## Task 1 - Server Discovery & Review Scan

- Implemented nested `.gitignore` support by prefixing rules with their directory path before adding them to a single `ignore` matcher. This keeps traversal logic simple while still honoring per-directory ignore files during a depth-first walk.
- Kept `listFiles()` as a compatibility alias to `walkMarkdownFiles()` during Task 1 so existing server routes keep compiling until Task 2 swaps them to the new API.

