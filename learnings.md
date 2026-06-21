# Implementation Learnings

Append-only record of surprises, bugs, and useful discoveries during execution.

## Task 0 — Project Scaffolding

- The edit tool will happily accept malformed JSON payload lines if the body is wrong; I introduced a stray `'},` line while editing `tsconfig.json` and had to repair it immediately. For small JSON updates, `npm pkg set` is safer than manual patching, and any direct `edit` to JSON needs an immediate `read` verification.

## Task 1 — Filesystem Operations Layer

- The first red test exposed a subtle bug in the path guard: `relative(base, base)` is an empty string, so treating `''` as an escape breaks any recursive directory walk that starts at the root. The right invariant is “reject only paths whose normalized relative path begins with `..`”, not “reject empty relative paths”.
- With the server on NodeNext resolution, Vitest + TypeScript will flag extensionless relative imports immediately. Adding `.js` in the test and production imports up front keeps the server code aligned with the eventual runtime.

## Task 2 — GitHub API Adapter Routes

- Hono's plain `*` route matcher does not populate `c.req.param('*')`. The route will match, but the wildcard value is missing. Named catch-all params (`:path{.+}`) are required if the handler needs the remainder of the path.
- `Response.json()` is typed as `unknown` under strict TypeScript. Route tests need explicit response interfaces and casts, otherwise the server typecheck fails even when Vitest passes at runtime.

## Task 3 — File Watcher & WebSocket Hub

- `vi.advanceTimersByTimeAsync()` only proves the debounce timer fired; it does not guarantee any async file I/O awaited inside the timer callback has completed. The watcher tests had to await the real `onEvent` promise, not just the timer advance.
- `vi.hoisted()` factories cannot safely close over imported runtime values. A fake watcher built on `EventEmitter` failed because the import had not initialized yet; a self-contained fake implementation inside the hoisted block avoids that trap.
- Hono/WS integration tests need a server-side signal for disconnect bookkeeping. Waiting on the browser/client `close` event races the server cleanup path; emitting `connection-count` changes from the hub made the test deterministic.

## Task 4 — Git Convenience Endpoints

- macOS temp paths can appear under both `/var/...` and `/private/var/...`. Git reports the repository root using the realpath, so computing a repo-relative scope from the unresolved temp path produced an "outside repository" error. `realpath()` on both values fixes that class of bug.
- Plain-text 404 bodies from Hono make route-registration misses obvious: a `response.json()` parse failure in tests is often a strong signal that the route never matched, not that the JSON payload shape is wrong.
