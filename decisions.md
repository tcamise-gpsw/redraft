# Implementation Decisions

Append-only record of meaningful execution-time decisions.

## Task 0 — Project Scaffolding

- Kept `npm run serve -- ./proposals` on the root command path by making `server/cli.ts` accept either a direct directory argument or the explicit `serve` subcommand. This preserves the approved plan's script shape (`tsx server/cli.ts`) while still allowing the eventual `draftspace serve <dir>` UX from the CLI.
- Implemented the `draftspace` bin as a thin ESM wrapper that re-invokes Node with `--import tsx` and `server/cli.ts`. This keeps the package unpublished-friendly and avoids a separate compile step for the CLI during local dogfooding.

## Task 1 — Filesystem Operations Layer

- Kept the filesystem layer pure and synchronous-at-the-boundary: all GitHub-shape concerns stay out of `server/fs/operations.ts`. The module only knows about bytes, paths, SHAs, and typed errors, which keeps the later Hono route layer thin.
- Used NodeNext-style `.js` relative imports inside server TypeScript files. The dedicated `server/tsconfig.json` uses NodeNext resolution, so explicit extensions avoid later runtime and editor divergence.
- Allowed `resolvePath()` to accept the root directory itself (`relative(base, base) === ''`). The guard only rejects resolved paths that escape the base (those whose relative path starts with `..`).

## Task 2 — GitHub API Adapter Routes

- Kept the local server API deliberately GitHub-shaped instead of introducing a Draftspace-specific REST surface. The frontend can keep using `GitHubClient` semantics later with only a base-URL override, which preserves the approved "same frontend, different backend" architecture.
- The routes treat the configured filesystem root as the logical `proposals/` directory. Tree responses prefix each entry with `proposals/`, while contents/commits routes strip that prefix before touching disk. This preserves frontend expectations without forcing the local server to serve an entire fake repository checkout.
- Centralized rate-limit headers and error mapping in `server/routes/index.ts` so the individual route files stay focused on transport logic rather than repeating response boilerplate.

## Task 3 — File Watcher & WebSocket Hub

- Implemented the watcher as a debounced path map keyed by relative file path, not as raw event passthrough. That collapses bursty editor/agent writes into a single flush per path while still preserving distinct created/changed/deleted semantics.
- Computed SHAs at flush time rather than at queue time. This means a burst of writes yields the final on-disk content hash, which is the only state the UI cares about after invalidating its queries.
- Extended `WebSocketHub` from `EventEmitter` and emitted `connection-count` changes. This was the cleanest deterministic signal for testing disconnect bookkeeping without introducing timer-based polling in the test suite.

## Task 4 — Git Convenience Endpoints

- Kept git as a convenience layer on top of immediate filesystem writes: the routes query and mutate the working tree, but no other server behavior depends on a successful commit. This preserves the spec's “commit button is optional” rule.
- Scoped `git status` and `git add` to the proposals directory using the repo-relative path returned from `git rev-parse --show-toplevel` + `relative(...)`. That prevents unrelated repository changes from leaking into Draftspace's status view or convenience commits.
- Forced a fallback git identity (`Draftspace <draftspace@local>`) on the commit command so the endpoint works even in fresh repos without user.name/user.email configured.

## Task 5 — CLI Entry Point & Server Bootstrap

- Kept static asset serving inside `server/app.ts` rather than adding a Hono-specific static middleware package. The server only needs a small, explicit MIME map for the built Vite output, and avoiding another dependency kept the bootstrap path transparent.
- Split the local server into two layers: `buildDraftspaceApp()` assembles the Hono routes and static responses for tests, while `startDraftspaceServer()` owns the real Node HTTP server, WebSocket upgrade handling, and lifecycle methods. That made the Hono-side behavior unit-testable without spinning up sockets.
- Preserved both CLI entry shapes from the plan: `npm run serve -- ./proposals` works via the root command path, while `draftspace serve ./proposals` works via the explicit subcommand. The actual option parsing had to use Commander’s action `this` binding for consistency across both shapes.
