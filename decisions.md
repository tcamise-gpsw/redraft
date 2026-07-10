# Implementation Decisions

## 2026-07-10 — Use polling watcher for local mode

During local browser verification against `/Users/tcamise/gopro/FUZZ-MONKEY`, `chokidar.watch()` with the default backend caused all child `git` subprocesses launched from HTTP handlers to fail with `spawn EBADF`. A minimal repro confirmed `chokidar.watch(FUZZ-MONKEY)` + `spawnSync('git')` fails, while the same repro with `usePolling: true` succeeds.

Decision: configure ReDraft's local watcher with `usePolling: true` and `interval: 1000`. This makes local git-backed sidecar operations reliable for large real repositories and gives us a stable local E2E path.
