---
name: e2e-browser-testing
description: Use when asked to run end-to-end testing of ReDraft, verify browser-visible behavior, investigate UI regressions, or exercise a feature in either remote GitHub mode or local filesystem mode. Also use for requests to smoke-test a change, validate a local server flow, or confirm that comment/editing/auth behavior works in a real browser.
---

# Skill: Browser E2E Testing for ReDraft

Use this skill when asked to run end-to-end testing of the ReDraft, verify browser-visible behavior, investigate UI regressions, or exercise a feature in either **remote GitHub mode** or **local filesystem mode**.

---

## Overview

This skill covers two distinct E2E paths:

1. **Remote regression mode** — run the existing Playwright suite against the Vite app. These tests mock GitHub API traffic and protect the GitHub-backed browser behavior.
2. **Local mode** — run browser tests or manual smoke checks against the local ReDraft server backed by real files on disk.

Choose the mode first. Do not mix them casually — the auth model, server startup, and verification method differ.

---

## Mode selection

### Use remote mode when
- validating existing app behavior without touching real GitHub data
- checking regressions in auth, documents, comments, or editing
- verifying frontend changes that should behave exactly as before in GitHub mode

### Use local mode when
- validating the local server flow
- verifying filesystem writeback
- verifying file watcher → WebSocket → UI updates
- testing AI-agent workflows that operate on local markdown documents

---

## Canonical test commands

Prefer the repo-owned commands over ad hoc browser driving when the goal is regression coverage.

```bash
npx playwright test
npx playwright test --project=remote
npx playwright test --project=local
npx playwright test e2e/comments.spec.ts --project=remote
npx vitest run
npx tsc --noEmit
npx tsc --noEmit -p server/tsconfig.json
npx eslint src/ server/
npx prettier --check src/ server/
npm run build
npm run serve
```

---

## Remote mode workflow

### What remote mode means here
- App served by `npm run dev`
- Playwright points at the Vite app
- Existing specs intercept/mock GitHub API calls
- No real repository writes are required for regression coverage

### Preferred verification path
Run the remote project, not manual browser poking, unless the user explicitly wants an interactive browser investigation.

```bash
npx playwright test --project=remote
```

Or for a targeted regression:

```bash
npx playwright test e2e/auth.spec.ts --project=remote
npx playwright test e2e/documents.spec.ts --project=remote
npx playwright test e2e/comments.spec.ts --project=remote
npx playwright test e2e/editing.spec.ts --project=remote
```

### Remote stability rules
- Keep the remote specs **unchanged** when using them as a regression gate.
- In this repo, the comments flow was flaky under parallel Playwright execution. `workers: 1` is intentional and should not be "optimized away" casually.
- If a remote spec fails only in the grouped suite, compare with an isolated run before concluding the app regressed.

---

## Local mode workflow

### What local mode means here
- App served by the local ReDraft server
- No PAT prompt; auth is bypassed as `local-user`
- Browser reads/writes real `.md` and `.comments.json` files
- Live updates come from filesystem watcher + WebSocket invalidation

### Preferred automated path
Use the repo's local Playwright project:

```bash
npx playwright test --project=local
```

The local project is expected to:
- build the frontend first
- serve a writable filesystem-backed repo root
- isolate writes from the checked-in repo content
- use the chokidar-backed watcher path on every platform; local watcher failures are actionable regressions, not the old macOS `fs.watch` flake

### Local fixture rule
Do not point destructive tests at the real checked-in repo unless the user explicitly wants that. Prefer a writable copy, e.g. `/tmp/redraft-local-playwright`, seeded with representative markdown files and `.redraft/comments/` metadata.

This keeps tests honest — real file writes, real watcher events, real server behavior — without leaving dirty repo content behind.

### Local server rule
The local server serves built assets. If you change frontend code, rebuild before trusting a local-mode browser result.

---

## Startup and isolation rules

### Do not race builds
Do **not** run `npm run build` concurrently with `npx playwright test` when Playwright's `webServer` also builds. In this repo, concurrent builds can collide in `dist/` and fail with Vite `ENOTEMPTY` errors while preparing the output directory.

If that happens:
1. treat it as environmental contention first, not an app regression
2. rerun Playwright after the standalone build finishes

### Clean server lifecycle
For manual local smoke tests:
- start the exact command: `npm run serve`
- if port `4200` is occupied, inspect the listener and clear stale ReDraft processes before retrying
- stop the server when finished so you do not leave orphan listeners behind

---

## Browser-driving patterns

Use these patterns when automated Playwright coverage is not enough and you need a real interactive browser session.

### 1. Observe before acting
Default to `tab.observe()` to get the current accessible tree. Navigation and mode switches can invalidate old element ids.

### 2. Reload if the initial render looks wrong
If View/WYSIWYG/Raw state looks inconsistent, or the document render obviously failed on first load, **reload or reopen the page before trusting any result**. One manual smoke session in this repo produced a bad initial render; only the fresh reload gave trustworthy evidence.

### 3. Prefer exact observed elements for mode switches
For `View`, `WYSIWYG`, `Raw`, and `Save`, prefer:
- `tab.observe()`
- locate the exact button by role/name
- click the observed element via `tab.id(...)`

This was more reliable than loose text selectors during mode transitions.

### 4. Verify the mode change in the DOM
After clicking `Raw`, confirm the editor actually changed:
- `Raw` button has `aria-pressed="true"`
- a `textarea` exists
- `.ProseMirror` is absent

Do not assume the click worked just because the button was visible.

### 5. Verify writes at the storage boundary
For local mode, the success toast is not enough. Verify the file on disk.

Examples:
- markdown save → read the `.md` file and confirm the new text
- comment save → read or poll the `.comments.json` sidecar
- external change → write to disk outside the browser and wait for UI update

---

## Local-mode scenarios worth covering

Use these as the default checklist for local E2E coverage.

1. **Auto-authentication**
   - open the app
   - confirm no PAT connect form
   - confirm user is `local-user`

2. **Document browsing**
   - tree shows `.md` files
   - selecting a document renders headings/text correctly
   - Mermaid content renders, not just raw code fences

3. **Editing and file writeback**
   - switch to `Raw`
   - edit markdown
   - save
   - read the document file from disk to prove writeback

4. **Comment operations**
   - select text or reply to an existing thread
   - save
   - verify the `.redraft/comments/` sidecar is updated

5. **Large-document comment performance**
   - open a ≥20 KB fixture doc with seeded comments
   - verify the comments sidebar renders without freezing
   - verify anchored and orphaned comments classify correctly
   - verify comment saves still write `.redraft/comments/` sidecars

6. **Live file watching**
   - mutate the open document outside the browser
   - verify the UI updates within a short window

7. **Live tree update**
   - create a new `.md` file on disk
   - verify it appears in the tree

8. **Optional git convenience**
   - only if the local git endpoints are in scope
   - verify status/commit UI against actual repo state

---

## Comment-specific lessons

### Remote mode
Remote comment tests are primarily regression tests for browser behavior. Keep them deterministic and do not depend on real GitHub propagation.

### Local mode
The first save of a missing `*.comments.json` file matters. The local server must behave like the frontend's GitHub client expects. In this repo, that meant supporting create-via-`PUT` with no `sha`, not only create-via-`POST`.

When validating local comments:
- remove or isolate the sidecar first if the scenario needs first-write behavior
- save through the UI
- poll the file on disk instead of relying only on transient dirty/saved banners

---

## When to trust manual browser evidence

Manual browser evidence counts only if:
- the page was in a clean, trustworthy render state
- the exact mode under test was confirmed in the DOM
- the final effect was verified at the real boundary
  - remote: test assertions / mocked API expectations
  - local: on-disk file content or watcher-driven UI change

Do not claim success from a visually plausible but unverified browser interaction.

---

## Fixing bugs found during E2E

When the browser shows a real bug:
1. identify the source file and root cause
2. fix the implementation, not the symptom
3. add or update the narrowest regression test that proves the behavior
4. rerun the specific failing check first
5. rerun the relevant broader gate (`vitest`, `playwright`, typecheck, lint) before claiming completion

---

## Repository context

- Local server command: `npm run serve`
- Dev server command: `npm run dev`
- Local app default URL: `http://127.0.0.1:4200`
- Remote dev app URL: `http://127.0.0.1:4173`
- Markdown documents can live anywhere under the served repo root
- Comment sidecars live under `.redraft/comments/<mirrored-path>.comments.json`
- Hash routing is in use: routes are `/#/d/...`
- Playwright has distinct `remote` and `local` projects
