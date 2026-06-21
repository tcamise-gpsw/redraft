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

## Task 6 — Frontend Local Mode Support

- Kept local-mode detection in a tiny DOM-based `src/lib/mode.ts` helper rather than threading environment flags through React context. The local server already injects the authoritative meta tag, so the frontend can stay stateless about how it was launched.
- Passed `baseUrl: getApiBaseUrl()` at each `GitHubClient` construction site instead of hiding mode detection inside the client itself. That keeps the client a transport wrapper, not a browser-environment inspector, and makes the base URL explicit in the code paths that choose a backend.
- Implemented local auth bypass inside `AuthProvider` by seeding a fixed `LOCAL_AUTH` state and turning logout/updateRepo into no-ops in local mode. That preserves the existing `AuthGate` contract and avoids a separate branching component tree for local mode.
- Mounted `useFileWatcher()` inside a new `AppBody` child under `QueryClientProvider`. That preserves the hook’s access to `useQueryClient()` without forcing the watcher logic into every route component.

## Task 7 — README Rewrite

- Repositioned the README as a user-facing product entry point, not a contributor setup guide. Development and architecture detail now stay in `docs/`, while the README explains usage modes, workflows, and prerequisites in plain language.
- Kept the local-mode quick start in README even though it includes `npm install` and `npm run build`, because in the current dogfooding phase the local server is consumed from this repo rather than an npm release. Those steps are still user-facing for the power-user / AI-agent persona.
- Updated `AGENTS.md` to acknowledge the new local server and repo-local skills as first-class parts of the codebase. Leaving the old “do not introduce a backend” rule in place would have become actively misleading.

## Task 8 — AI Skill — `draftspace-review`

- Followed the skill-creator anatomy rather than the earlier lowercase filename sketch: the skill lives at `.agents/skills/draftspace-review/SKILL.md` with a sibling README and eval seed file. This matches the documented skill package shape and is the least surprising structure for future tooling.
- Kept the skill opinionated about the hybrid workflow boundary: proposal markdown is read and edited directly on disk, while comment mutations go through the local Draftspace API. That prevents the skill from silently bypassing SHA locking or live browser updates.
- Seeded realistic eval prompts in `evals/evals.json` even though the repo does not vendor the full skill-creator benchmark/viewer scripts. That preserves the next step for future trigger/output evaluation without blocking this implementation task on missing local tooling.

## Task 9 — E2E Tests — Local Mode + Remote Regression

- Added Playwright projects for both remote and local mode instead of a single global environment. Remote tests continue to mock GitHub against the Vite dev server, while the local-mode spec points at a filesystem-backed server on a separate port.
- The local-mode Playwright server boot command copies `proposals/` into `/tmp/draftspace-local-playwright` before serving it. That gives the tests a writable workspace without mutating the repository’s real proposal files or requiring a second fixture tree to be checked into git.
- Set Playwright `workers: 1` globally to stabilize the previously flaky remote comments flow. The failure reproduced only under parallel execution, and serializing the suite is the smallest reliability-first change.
- Updated the local contents route so `PUT /contents/:path` creates a missing file when no `sha` is supplied. That matches the actual Octokit contract used by `GitHubClient.createFile()` and keeps the local server behavior transport-compatible with GitHub instead of requiring frontend special-casing.
