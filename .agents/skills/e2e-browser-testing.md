# Skill: Live Browser E2E Testing for Proposal Review Workspace

Use this skill when asked to run end-to-end testing of the Proposal Review Workspace application, verify a new feature works in the browser, or investigate a browser-visible bug in the app.

---

## Overview

This skill drives a real Chromium browser against the dev server to exercise the full application stack: auth, proposals tree, document view, inline comments, editing, and replies. It fixes bugs found along the way and creates regression tests.

---

## Prerequisites

### 1. Dev server
```bash
cd ~/gopro/draftspace
npm run dev   # starts at http://localhost:5173/
```
Confirm with `curl -s http://localhost:5173/ | head -5`.

### 2. Test data in the repo
The app reads proposals from `proposals/` via the GitHub REST API — local files are not visible unless pushed.

Create test proposals and push before testing:
```bash
# proposals/test-proposal.md
cat > ~/gopro/draftspace/proposals/test-proposal.md << 'EOF'
# Test Proposal

Content for E2E testing.
EOF
cd ~/gopro/draftspace && git add proposals/ && git commit -m "test: add E2E test proposals" && git push origin main
```

### 3. GitHub token
Use the `gh` CLI OAuth token (has `repo` scope = Contents R/W + Metadata R):
```bash
gh auth token   # returns gho_... token
```
This is injected into the browser via `localStorage` — never committed.

---

## Auth Injection Pattern

The app stores auth in `localStorage` under `proposal-review.auth`. **Never use `tab.click()` on the Connect button** — it causes a browser tool JS exception due to React re-render timing. Instead, seed `localStorage` directly:

```js
// In browser run code:
const authResult = await tab.evaluate(async () => {
  const existing = localStorage.getItem('proposal-review.auth');
  if (existing) return JSON.parse(existing).user?.login;

  const resp = await fetch('https://api.github.com/user', {
    headers: { Authorization: 'token <GH_TOKEN>' }
  });
  const user = await resp.json();
  localStorage.setItem('proposal-review.auth', JSON.stringify({
    pat: '<GH_TOKEN>',
    owner: '<OWNER>',
    repo: '<REPO>',
    user: { login: user.login, avatarUrl: user.avatar_url }
  }));
  return user.login;
});
await tab.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 2000));
```

For `tcamise-gpsw/draftspace`, owner is `tcamise-gpsw`, repo is `draftspace`.

---

## Browser Interaction Patterns

### Open a tab
```js
// browser tool: action=open, name="main", url="http://localhost:5173/"
```

### Click buttons safely
`tab.click()` can throw when the click triggers a React re-render. Use `evaluate` for all button clicks to avoid tool-level exceptions:
```js
await tab.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Button Label');
  btn?.click();
});
```

### Click links
Links in the proposal tree have accessible names like `proposals/api-design.md`. Use `tab.id()` from `tab.observe()`:
```js
const obs = await tab.observe();
const link = obs.elements.find(e => e.role === 'link' && e.name?.includes('api-design'));
const el = await tab.id(link.id);
await el.click();
await new Promise(r => setTimeout(r, 3000));
```

### Fill a textarea (React-compatible)
Use `tab.fill()` — this triggers React's synthetic onChange correctly. `element.value = ...` does NOT update React state:
```js
await tab.fill('textarea', 'New content here');
```

### Text selection → comment popover
Simulate text selection inside `#document-markdown-root` and dispatch `mouseup`
(the component shows on `mouseup`/`keyup`; `selectionchange` only clears):
```js
await tab.evaluate(() => {
  const root = document.querySelector('#document-markdown-root');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 20);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.dispatchEvent(new Event('mouseup'));
});
await new Promise(r => setTimeout(r, 300));
// Then click the Comment button that appeared
await tab.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent?.trim() === 'Comment');
  btn?.click();
});
```

### Wait for GitHub API calls
GitHub writes take 2–5 seconds. Always wait after submitting forms:
```js
await new Promise(r => setTimeout(r, 4000));
```

Use `timeout: 15` on browser `run` calls that include long waits.

### Capture JS errors from the page
```js
await tab.evaluate(() => {
  window.__errors = [];
  window.addEventListener('error', e => window.__errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));
});
// ... run actions ...
const errors = await tab.evaluate(() => window.__errors || []);
```

---

## Test Flows

Test each flow in order. Take a screenshot after each to confirm expected state.

### 1. Auth form (manual flow verification)
- Clear localStorage, load `http://localhost:5173/`
- Confirm "Connect to GitHub" form renders
- Seed auth via `tab.evaluate()` (see pattern above)
- Reload: confirm proposals tree shows `.md` files

### 2. Proposals tree
- Verify only `.md` files appear (no `.comments.json` sidecars)
- Verify directories expand/collapse
- Check active proposal is highlighted

### 3. View proposal
- Click a proposal link using `tab.id()` from `tab.observe()`
- URL should become `#/proposals/<name>.md`
- Confirm markdown renders (code blocks, headings)
- Confirm activity indicator shows author + relative time
- Confirm right sidebar shows empty state or existing comments

### 4. Add comment
- Select text (see pattern above)
- Confirm "Comment" popover button appears
- Click it → CommentForm appears in right sidebar
- Fill textarea with `tab.fill()`
- Submit → comment should appear in sidebar **without reload**
- Verify `.comments.json` was written to GitHub:
  ```bash
  gh api repos/<owner>/<repo>/contents/proposals/<name>.comments.json \
    | python3 -c "import sys,json,base64; d=json.load(sys.stdin); print(base64.b64decode(d['content']).decode())"
  ```

### 5. Reply to thread
- Click "Reply" button
- Fill textarea, click "Submit reply"
- Reply should appear in sidebar immediately (no reload needed)

### 6. Resolve thread
- Click "Resolve thread"
- Button label should change to "Re-open thread" without reload
- Thread card should become slightly dimmed (`opacity-70`)

### 7. Edit proposal
- Click "Edit" button → navigates to `#/proposals/<name>/edit`
- Confirm raw markdown in textarea, character count shown
- Use `tab.fill('textarea', newContent)` — do NOT use `element.value =`
- Click Save → navigates back to view, new content rendered
- Activity indicator should update to show the new commit

### 8. Create proposal
- Click "New Proposal" button
- Dialog appears with File path and Title fields
- Fill fields, click "Create proposal"
- New proposal should appear in sidebar tree immediately (no reload)
- Navigates to the new proposal's view

---

## Bug Verification Checklist

After fixes, verify these regressions don't recur:

| # | Area | Symptom if broken |
|---|------|-------------------|
| 2 | CommentsSidebar | Right panel blank with no message when no comments |
| 3 | MarkdownRenderer | TypeScript error: `onTextSelect` prop doesn't exist |
| 4 | useComments | Comment/resolve doesn't appear until page reload |
| 5 | ProposalTree | `.comments.json` files visible in sidebar tree |
| 7 | ActivityIndicator | Shows old commit message after editing |
| 8 | ActivityIndicator | Shows "1 hour ago" for a just-saved proposal |
| 9 | ProposalTree | Newly created proposal missing from sidebar until reload |

---

## Fixing Bugs Found

When a bug is found:

1. **Identify the root cause** in the source (don't patch symptoms)
2. **Check `docs/specs/`** for design intent before deciding on a fix
3. **Fix at the source file** — not in tests, not with workarounds
4. **Write a regression test** in the matching `__tests__/` file using Vitest
5. **Run the test suite** to confirm green: `npx vitest run`
6. **Run typecheck and lint**: `npx tsc --noEmit && npx eslint src/`
7. **Commit with a descriptive message** following Conventional Commits format

### Common root causes in this codebase

**UI not updating after GitHub write**
→ Race condition: `invalidateQueries` refetches before GitHub propagates the change.
→ Fix: call `queryClient.setQueryData(queryKey, knownNewState)` immediately after the write, then keep `invalidateQueries` for background sync.

**Wrong query key in invalidation**
→ Verify the key matches exactly what `useQuery` uses. Content key: `['proposal', path, 'content']`, commit key: `['proposal', path, 'commit']`, comments key: `['proposal', path, 'comments']`, tree key: `['proposals', 'tree']`.

**Stale data after navigation**
→ `staleTime: 30_000` in the QueryClient. If data is < 30s old, TanStack Query won't refetch on remount. Use explicit invalidation or `setQueryData`.

---

## Test Commands

```bash
npx vitest run                    # all unit tests
npx tsc --noEmit                  # typecheck
npx eslint src/                   # lint
npx prettier --check src/         # format check
npx playwright test               # E2E (requires npm run dev)
npm run build                     # production build
```

---

## Repository Context

- **Repo**: `tcamise-gpsw/draftspace` (public)
- **Pages URL**: `https://tcamise-gpsw.github.io/draftspace/`
- **PAT in use**: `gh auth token` (OAuth token with `repo` scope)
- **Proposals storage**: `proposals/*.md` + `proposals/*.comments.json` sidecars
- **Test proposals**: `proposals/api-design-v2.md`, `proposals/auth-overhaul.md`
- **Hash routing**: all routes are `/#/...`
- **QueryClient staleTime**: 30 seconds
