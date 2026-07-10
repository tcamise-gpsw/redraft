# Testing notes and gotchas

Hard-won lessons about this repo's test suite. Read before debugging a
confusing e2e failure — most "flaky" or "works-locally-fails-in-CI" cases here
have a known cause below.

## Commands

```bash
npx vitest run                              # unit + hook + server tests
npx tsc --noEmit                            # app typecheck
npx tsc --noEmit -p server/tsconfig.json    # server typecheck
npx eslint src/ server/                     # lint
npx prettier --check src/ server/           # format (src/ and server/ only)
npx playwright test --project=remote        # remote e2e (mocked GitHub API)
npx playwright test --project=local         # local e2e (real filesystem server)
```

CI (`.github/workflows/ci.yml`) runs, in order: lint+typecheck+test, then
`playwright --project=remote`, then `playwright --project=local`. **A failure in
an earlier step short-circuits the later ones** — e.g. a remote e2e failure means
the local project never runs, so a green-looking "only remote failed" can still
hide local issues. **CI is the source of truth.**

## The document tree starts collapsed

The navigation tree opens with the top-level **Documents** section expanded but
every **subdirectory collapsed** (`DocumentTree` `documentsExpanded = true`,
`TreeNode` `expanded = false`). Root-level files and folder buttons are visible
on load; files nested inside a folder are **not** until that folder is expanded.

Consequence for tests: any unit or e2e test that interacts with a nested file
must expand its parent folder first. The folder button's accessible name is the
folder name:

```ts
// Playwright
await page.getByRole('button', { name: 'docs', exact: true }).click();
await page.getByRole('link', { name: 'auth-overhaul.md' }).click();

// Testing Library
fireEvent.click(await screen.findByRole('button', { name: 'media' }));
```

This bit `e2e/documents.spec.ts` and `e2e/local-mode.spec.ts` when the collapse
behavior landed — the fix is to expand the folder, not to change the app.

## Remote e2e can false-green off a stale dev server

The remote Playwright project does **not** use Vite's default `5173` port. In
`playwright.config.ts` it starts `npm run dev -- --host 127.0.0.1 --port 4173`
and points the `remote` project at `4173` with `reuseExistingServer: true`.
If a dev server is already listening on `4173` (left over from a previous run
or session), Playwright **reuses it** instead of starting a fresh one. A reused
server can serve a module graph that predates your latest source change, so the
suite passes locally while CI — which always starts fresh — fails on the real
behavior.

Rule: before trusting a local e2e result or retrying after a failure, kill stray
servers so Playwright starts clean:

```bash
lsof -ti :4173 | xargs kill -9 2>/dev/null   # remote Playwright Vite server
lsof -ti :4201 | xargs kill -9 2>/dev/null   # local Playwright server
lsof -ti :5173 | xargs kill -9 2>/dev/null   # ad hoc `npm run dev` / default Vite dev server
lsof -ti :5174 | xargs kill -9 2>/dev/null   # Hono backend paired with `npm run dev:local`
lsof -ti :4200 | xargs kill -9 2>/dev/null   # standalone `npm run serve`
```

`4173` and `4201` are Playwright-only ports. `5173` is the normal Vite dev
server, `5174` is the manual Hono port behind `npm run dev:local`, and `4200`
is the default standalone local server.

When local remote-e2e disagrees with CI, suspect a stale `4173` server first and
treat CI as authoritative.

## Local-mode external file changes use chokidar on every platform

`e2e/local-mode.spec.ts` › "writes markdown edits back to disk and reflects
external file changes" asserts that a file changed on disk **outside** the UI
propagates back to the open document (chokidar watcher → WebSocket → query
invalidation → re-render).

The local server now uses **chokidar on all platforms** in
`server/fs/watcher.ts`. This intentionally avoids Node's native recursive
`fs.watch` path on macOS/Windows, which dropped nested-file (`docs/…`) change
events under load and made the full local Playwright project flaky.

Guidance:

- Treat failures in this test as real local-mode watcher regressions unless
  environmental evidence says otherwise.
- If the test fails only after a build/server race, rerun after the standalone
  build or stale server has stopped.
- For a narrow signal while debugging, run
  `npx playwright test --project=local e2e/local-mode.spec.ts --grep "writes markdown edits"`.

## Don't race builds

The local Playwright project's `webServer` runs `npm run build`. Do **not** run a
standalone `npm run build` concurrently with `npx playwright test` — parallel
writes to `dist/` collide with Vite `ENOTEMPTY` errors. Let one finish first.
