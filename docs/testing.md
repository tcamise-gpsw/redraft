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

The remote Playwright project points at `npm run dev` (Vite, port 4173) with
`reuseExistingServer: true`. If a dev server is already listening on 4173 (left
over from a previous run or session), Playwright **reuses it** instead of
starting a fresh one. A reused server can serve a module graph that predates
your latest source change, so the suite passes locally while CI — which always
starts fresh — fails on the real behavior.

Rule: before trusting a local remote-e2e result, kill stray servers so Playwright
starts clean:

```bash
lsof -ti :4173 | xargs kill -9 2>/dev/null   # remote dev server
lsof -ti :4201 | xargs kill -9 2>/dev/null   # local e2e server
lsof -ti :5173 | xargs kill -9 2>/dev/null   # default `npm run dev`
lsof -ti :4200 | xargs kill -9 2>/dev/null   # `npm run serve`
```

When local remote-e2e disagrees with CI, suspect a stale server first and treat
CI as authoritative.

## macOS: `local-mode.spec.ts` external-change test is flaky in the full run

`e2e/local-mode.spec.ts` › "writes markdown edits back to disk and reflects
external file changes" asserts that a file changed on disk **outside** the UI
propagates back to the open document (fs watcher → WebSocket → query
invalidation → re-render).

On **macOS** this test passes in isolation (and with `--repeat-each`) but can
fail in the full sequential run with `getByText('Changed outside the UI')` never
appearing. Root cause: the server watcher uses Node's **native recursive
`fs.watch`** on macOS/Windows (`server/fs/watcher.ts`), which drops nested-file
(`docs/…`) change events under load. This reproduces on `main` too — it is not
caused by any recent feature work.

**CI is unaffected**: on Linux the watcher uses **chokidar** (reliable, via
inotify), so the local project is green in CI. Forcing chokidar on all platforms
makes it deterministically green locally as well (verified), but that is a
watcher change deliberately kept out of feature branches.

Guidance:

- Don't chase this as a regression from unrelated feature work — confirm against
  `main` first (`git stash && git checkout <main-sha> && npx playwright test
--project=local`).
- To get a trustworthy local signal, run the test in isolation
  (`npx playwright test --project=local e2e/local-mode.spec.ts:<line>`), or rely
  on CI's Linux/chokidar run.
- The real fix (if we choose to make local match CI) is to use chokidar on all
  platforms in `server/fs/watcher.ts`.

## Don't race builds

The local Playwright project's `webServer` runs `npm run build`. Do **not** run a
standalone `npm run build` concurrently with `npx playwright test` — parallel
writes to `dist/` collide with Vite `ENOTEMPTY` errors. Let one finish first.
