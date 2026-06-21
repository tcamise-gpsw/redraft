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

## Task 5 — CLI Entry Point & Server Bootstrap

- Commander’s root command action and subcommand action do not hand you the same second argument shape. Treating the second argument as parsed options worked in one path and failed in the other. Using the action callback’s `this: Command` binding was the stable cross-path fix.
- The CLI verification exposed that problem immediately because the subcommand silently ignored `--port` and tried to bind the default 4200. A cheap manual smoke test on a second port is worth running before wiring E2E around a new CLI.
- For Node-side Hono use, `app.fetch()` plus a small `IncomingMessage` → `Request` bridge is enough. A dedicated adapter package was not necessary for the current server scope.

## Task 6 — Frontend Local Mode Support

- When the local server serves from `dist/`, any local-mode UI verification is meaningless until the bundle is rebuilt. I initially verified against stale assets and only saw the auth bypass once `npm run build` was rerun.
- Playwright/browser verification against a live local server is useful even before the formal E2E task. It quickly proved the absence of the PAT form and confirmed that filesystem-created proposal files appeared in the tree through the WebSocket invalidation path.
- The existing remote comments Playwright spec passed in isolation but timed out when grouped with the rest of the remote suite. That points to a pre-existing parallelism/timing sensitivity rather than a clear local-mode regression; it needs stabilization in Task 9 before the final validation pass.

## Task 7 — README Rewrite

- A client-facing README for this project still needs a small amount of repo-local setup because local mode is not published yet. The clean split is: README explains the user journey and the minimum commands to get there, while `docs/development.md` keeps contributor-focused build/test/deploy detail.

## Task 8 — AI Skill — `redraft-review`

- The repo already had a project-local skill as a single markdown file, but the skill-creator guidance expects a folder with `SKILL.md`. For new skills, following the skill-creator package shape is the safer long-term choice, even if legacy project-local skills use a flatter layout.
- The skill-creator evaluation workflow is not vendored into this repo, so a full benchmark/reviewer loop is not runnable in-place. Seeding `evals/evals.json` is the practical compromise: the prompts are ready when the external tooling is available, and the implementation is not blocked by missing helper scripts.

## Task 9 — E2E Tests — Local Mode + Remote Regression

- The remote comments spec failure was a real concurrency issue, not a deterministic logic regression: it passed consistently on its own and as part of the suite once workers were forced to 1. That is exactly the kind of browser-level flake worth fixing in configuration instead of papering over in the test body.
- Local-mode browser tests are far easier against a writable copy of `proposals/` than against the real repo tree. Copying into `/tmp` kept the tests honest (real filesystem writes, real watcher events) without leaving behind committed or half-restored proposal edits.
- The first local comment-save E2E exposed a contract mismatch between the local server and `GitHubClient`: Octokit’s `createOrUpdateFileContents` issues a `PUT` without `sha` for creates, so the local server had to support “PUT creates missing file” instead of assuming creation only happens via `POST`.

## Task 10 — Final Validation

- `npx playwright test` can fail during `webServer` startup if it runs concurrently with a top-level `npm run build`: both touch `dist/`, and Vite can throw `ENOTEMPTY` while preparing the out directory. The failure was environmental contention, not an app regression; rerunning Playwright after the standalone build finished passed cleanly.
