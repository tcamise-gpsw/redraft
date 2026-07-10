# Implementation Learnings

## 2026-07-10 — Keep local E2E fixture-owned

The useful signal from ad hoc large-repo testing was not the repository itself; it was the scenario shape: real Git history, documents on `main`, sidecars on `redraft`, large markdown content, seeded comments, and watcher pressure while HTTP handlers spawn `git`. Future local-mode regressions should be reproduced in the repo-owned `test-fixtures` submodule and Playwright/Vitest coverage so CI can catch them.
