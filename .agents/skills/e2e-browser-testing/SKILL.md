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

Before running manual QA, check `issue://?state=open&label=bug` for known bugs
to avoid re-reporting fixed or already-tracked issues.

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

### Do NOT run remote and local projects in parallel

The `webServer` array in `playwright.config.ts` is **global** — Playwright starts
ALL web servers regardless of which `--project=` you select. Running two separate
`npx playwright test` processes concurrently causes:

- **Port collisions**: the first process occupies port 4201; the second fails with
  `http://127.0.0.1:4201 is already used`.
- **Git init race**: both processes run `rm -rf /tmp/redraft-local-playwright &&
  git init` simultaneously, producing `fatal: cannot copy … File exists`.

Always run remote and local sequentially:
```bash
npx playwright test --project=remote && npx playwright test --project=local
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

### Real-repo remote testing (browser-driven, no mocks)

For deeper confidence — especially after changes to comment anchoring, rendering, or the GitHub client — run the dev server against the real fixture repo instead of the mocked Playwright suite.

**Dev server lifetime note:**
The bash tool caps at 3600 s. For sessions longer than an hour, start the dev
server in a real terminal instead — not via the agent's bash tool — so it does not
time out mid-test. Restart with `timeout=3600` in the bash tool as a workaround
for shorter sessions.

**Setup:**
```bash
# 1. Start the Vite dev server (same port the remote Playwright project uses)
npm run dev -- --host 127.0.0.1 --port 4173
# Or from a worktree:
cd ~/gopro/redraft-<branch> && npm run dev -- --host 127.0.0.1 --port 4173
```

**HMR + worktree sync:**
When the dev server runs from a worktree (`redraft-<branch>/`) and you edit files
in the main repo (`redraft/`), HMR never fires — the watcher is scoped to the
worktree. Sync the changed file explicitly before testing:
```bash
cp src/hooks/useComments.ts ~/gopro/redraft-<branch>/src/hooks/useComments.ts
```

**Authenticate with the real PAT:**

The app caches the PAT in `localStorage`. If a prior session already authenticated,
the auth form will not appear — the app loads directly into the documents view.
Check `tab.observe()` before filling auth fields.

```javascript
// Get PAT from gh CLI
const token = (await Bun.$`gh auth token`.text()).trim();
// Auth form uses htmlFor-linked labels, not aria-label attributes
await tab.fill('#github-pat', token);
await tab.fill('#repository', 'tcamise-gpsw/redraft-test-repo');
await tab.click('button[type="submit"]');
```

The sandbox repo (`tcamise-gpsw/redraft-test-repo`) is the `test-fixtures` submodule
remote. Documents on `main`: `api-design-v2.md` (has existing seeded comments),
`getting-started.md`, `docs/architecture.md`, `docs/auth-overhaul.md`,
`docs/deployment.md`, `docs/platform-architecture.md`, `rfcs/rfc-001-pagination.md`,
`rfcs/rfc-002-error-responses.md`, `README.md`. Sidecar branch: `redraft`
(`.redraft/comments/main/…`). The PAT is available via `gh auth token`.

**Baseline tag:** `e2e-baseline-2026-07-10` marks a known-good state of the
fixture repo. Reset to it if test artifacts accumulate:
```bash
cd test-fixtures && git reset --hard e2e-baseline-2026-07-10 && git push --force origin redraft main
```

**What this covers that mocked tests cannot:**
- Real GitHub API latency triggering TanStack Query window-focus refetches
- Actual sidecar reads and writes against the GitHub contents API
- Backward compatibility for sidecars without the `offset` field (real historical data)
- The `renderedText` data flow under realistic async content-load timing

**Known behavior in real-repo mode:**
- After saving a comment, navigating away and back no longer shows stale state.
  `saveComments` now calls `queryClient.setQueryData` to seed the comments cache
  and `queryClient.invalidateQueries(['documents','tree',…])` on first-write so
  the Under Review list also refreshes — no hard reload required.
- Any test artifacts (newly created sidecars) must be cleaned up manually after
  testing. Pattern:
  ```bash
  SHA=$(gh api "repos/OWNER/REPO/contents/.redraft/comments/BRANCH/PATH.comments.json?ref=SIDECAR" --jq '.sha')
  gh api "repos/OWNER/REPO/contents/.redraft/comments/BRANCH/PATH.comments.json" \
    --method DELETE \
    -f message="chore(test): remove test artifact" \
    -f sha="$SHA" \
    -f branch=SIDECAR \
    --jq '.commit.sha'
  ```
  Always delete artifacts before committing or creating a PR.
---

## Local mode workflow

### What local mode means here
- App served by the local ReDraft server
- No PAT prompt; auth is bypassed as `local-user`
- Browser reads/writes real `.md` files from the working tree
- Comment sidecars live on the local Git sidecar branch (`redraft` by default), at `.redraft/comments/<document-branch>/…` paths — not in the working tree
- Live document updates come from filesystem watcher + WebSocket invalidation

### Preferred automated path
Use the repo's local Playwright project:

```bash
npx playwright test --project=local
```

The local project is expected to:
- build the frontend first
- serve a writable filesystem-backed repo root
- initialize that writable copy as a Git repo with markdown documents on `main`
- seed an orphan `redraft` branch containing `.redraft/comments/main/…` sidecar files
- isolate writes from checked-in repo content
- use the chokidar polling watcher path on every platform; watcher failures that break child `git` subprocesses are actionable regressions

### Local fixture rule
Do not point destructive tests at the real checked-in repo unless the user explicitly wants that. Prefer a writable copy, e.g. `/tmp/redraft-local-playwright`, seeded with representative markdown files on `main` and sidecar JSON on a local `redraft` branch.

This keeps tests honest — real document file writes, real sidecar branch commits, real watcher events, real server behavior — without leaving dirty repo content behind.

### Local server rule
The local server serves built assets. If you change frontend code, rebuild before trusting a local-mode browser result.

### Stable local manual startup
For manual browser smoke tests, use a deterministic startup harness:

1. Kill stale listeners on the target port range before starting. ReDraft auto-increments if the requested port is occupied; if you do not clear old listeners, you may test the wrong server.
2. Run `npm run build` after frontend/server changes.
3. Start the built CLI on an explicit port and capture its log:
   ```bash
   node dist-server/cli.mjs /absolute/path/to/repo --port 4450 </dev/null >/tmp/redraft-local.log 2>&1 &
   ```
4. Read `/tmp/redraft-local.log` and use the actual URL printed by `ReDraft local server listening at ...`; do not assume the requested port.
5. Before opening a browser, verify:
   ```bash
   curl http://127.0.0.1:<port>/api/git/branch
   curl 'http://127.0.0.1:<port>/api/github/repos/local/redraft/git/trees/HEAD?recursive=1&sidecarBranch=redraft'
   ```
6. Only then drive Chromium.

Use the repo-owned `test-fixtures` submodule for repeatable local smoke tests. It should be copied into a writable temp workspace, initialized with documents on `main`, and seeded with sidecars on a local `redraft` branch.

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
For local mode, the success toast is not enough. Verify the real storage boundary.

Examples:
- markdown save → read the `.md` file in the served working tree and confirm the new text
- comment save/reply/resolve → inspect the `redraft` branch, e.g. `git show redraft:.redraft/comments/main/docs/foo.comments.json` and `git log -1 redraft`
- external document change → write to disk outside the browser and wait for UI update

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

   **New Document creation:**
   - click "New Document"
   - fill "File path" (`#document-path`) and "Title" (`#document-title`)
   - verify the file appears on disk and in the tree

4. **Comment operations**
   - select text or reply to an existing thread
   - save
   - verify the matching sidecar JSON changed on the local `redraft` branch with `git show`

5. **Large-document comment performance**
   - open a ≥20 KB fixture doc with seeded comments from the `redraft` branch
   - verify the comments sidebar renders without freezing
   - verify anchored and orphaned comments classify correctly
   - verify comment saves commit updated sidecar JSON to the `redraft` branch

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

## SPA cache and hard-reload behavior

ReDraft uses TanStack Query with `staleTime: Infinity` for both the document tree
and comment sidecar queries. This means **in-memory caches never auto-refresh**
between navigations unless explicitly invalidated.

### `page.goto(hash-url)` does NOT clear the cache
Because the app is a hash-router SPA, `page.goto('http://…/#/d/foo.md')` is a
SPA navigation — React stays mounted, TanStack Query cache is preserved. Use it
to simulate what the user experiences navigating within the app.

### `page.evaluate(() => location.reload())` clears the cache
This forces a full browser reload (equivalent to Ctrl-F5). JS memory is wiped,
TanStack Query starts fresh, and all queries refetch from the network. Use it
when you need to validate behavior on a clean mount, or to verify that a file
written to GitHub will actually be read back correctly.

### After `saveComments`
- **Comments cache**: `queryClient.setQueryData` is called immediately — the
  cached thread list reflects the just-written content on the next mount without
  a network round-trip.
- **Document tree / Under Review**: on first-write (brand-new sidecar),
  `queryClient.invalidateQueries(['documents','tree',…])` is called so the Under
  Review list updates in the same session without any reload.

---

## Delete operation confirmations

Both "Delete thread" and "Delete reply" show an in-UI confirmation step before
executing. If automation misses it, the delete silently does nothing.

| Action | First button clicked | Confirmation button name |
|---|---|---|
| Delete thread | `"Delete thread"` | `"Confirm delete"` |
| Delete reply | `"Delete reply"` | `"Confirm"` |

Automation pattern:
```javascript
// click the action button
const deleteBtn = obs.elements.find(e => e.role === 'button' && e.name === 'Delete thread');
await (await tab.id(deleteBtn.id)).click();
await new Promise(r => setTimeout(r, 200));
// re-observe — a confirmation button has appeared
const obs2 = await tab.observe();
const confirmBtn = obs2.elements.find(e => e.role === 'button' && e.name === 'Confirm delete');
await (await tab.id(confirmBtn.id)).click();
```

---

## Text selection across formatted DOM nodes

`innerText.indexOf(quote)` fails when the quote spans formatted nodes (`<strong>`,
`<em>`, `<code>`, `<a>`). ProseMirror splits text across these element boundaries,
so a substring that looks continuous in rendered output may not appear in any
single text node.

**Correct approach: walk the text-node tree**
```javascript
// In page.evaluate() — builds a flat text + text-node map, then constructs a Range
const root = document.querySelector('.ProseMirror');
const nodes = [];
const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
let pos = 0, n;
while ((n = walker.nextNode())) { nodes.push([n, pos]); pos += n.textContent?.length ?? 0; }
const fullText = nodes.map(([n]) => n.textContent ?? '').join('');

const quote = 'your target substring';
const start = fullText.indexOf(quote);
// if start === -1, the substring doesn't exist in rendered text — check rendered vs raw

let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
for (const [x, xs] of nodes) {
  const xe = xs + (x.textContent?.length ?? 0);
  if (!startNode && xe > start) { startNode = x; startOffset = start - xs; }
  if (!endNode && xe >= start + quote.length) { endNode = x; endOffset = start + quote.length - xs; break; }
}
const range = document.createRange();
range.setStart(startNode, startOffset);
range.setEnd(endNode, endOffset);
window.getSelection()?.removeAllRanges();
window.getSelection()?.addRange(range);
root.focus();
startNode.parentElement?.scrollIntoView({ block: 'center', behavior: 'instant' });
document.dispatchEvent(new Event('selectionchange'));
root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
```

**Key pitfalls:**
- The `fullText` here is plain-text concatenation of ALL text nodes — it matches
  what ProseMirror's `doc.textBetween` returns, NOT what `innerText` returns.
  `innerText` collapses whitespace and inserts `\n` at block boundaries; `fullText`
  from text nodes does not. Prefer short, distinctive quotes to avoid boundary issues.
- In headless Chromium, `coordsAtPos` from ProseMirror returns pixel coordinates
  relative to the current viewport. If the selection is below the fold, the
  Comment button (position: fixed) uses these coords and may land off-screen.
  `scrollIntoView` before dispatching `mouseup` prevents this.
- After the mouseup, wait ≥ 400 ms before observing — the Comment button appears
  asynchronously via a React state update triggered by `selectionchange`.

---

## Sidecar path convention

`commentPath(docPath, branch)` strips the `.md` extension before appending
`.comments.json`. Examples:

| Document path | Sidecar branch | Sidecar path |
|---|---|---|
| `README.md` | `redraft` | `.redraft/comments/main/README.comments.json` |
| `rfcs/rfc-001-pagination.md` | `redraft` | `.redraft/comments/main/rfcs/rfc-001-pagination.comments.json` |
| `docs/architecture.md` | `redraft` | `.redraft/comments/main/docs/architecture.comments.json` |

The `main` segment is the **document branch** (where the `.md` files live), not
the sidecar branch. Verify with:
```bash
gh api "repos/OWNER/REPO/git/trees/SIDECAR_BRANCH?recursive=true" \
  --jq '[.tree[] | select(.path | endswith(".comments.json")) | .path]'
```

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
