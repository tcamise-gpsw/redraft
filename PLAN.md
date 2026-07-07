# Sidecar Branch Implementation Plan

**Goal:** Move `.redraft/comments/` sidecar files to a configurable branch (default: `redraft`), namespaced by document branch, so review metadata doesn't pollute the document branch.

**Architecture:** A `sidecarBranch` concept is added to the auth context and threaded through comment read/write hooks and document tree detection. A new `commentPath(docPath, docBranch)` utility generates branch-namespaced sidecar paths. The local server's git commit route splits document and sidecar commits — documents via normal `git add`, sidecars via git plumbing to the sidecar branch without checkout. Settings UI exposes the sidecar branch name.

**Tech Stack:** React (hooks, context), TanStack Query, Hono (local server), Git plumbing commands, Vitest, Commander (CLI).

**Spec:** `docs/specs/2026-07-07-sidecar-branch-design.md`

---

### Task 1: Comment Path Utility and Storage Layer

**Files:**

- Create: `src/lib/comments/paths.ts` — `sanitizeBranch()` and `commentPath()` utilities
- Create: `src/lib/comments/__tests__/paths.test.ts` — unit tests
- Modify: `src/lib/comments/index.ts` — re-export path utilities
- Modify: `src/lib/auth/storage.ts` — add sidecar branch storage functions
- Modify: `src/lib/auth/__tests__/storage.test.ts` — test new storage functions
- Modify: `src/lib/auth/index.ts` — re-export new functions

**Interface:**

`src/lib/comments/paths.ts`:

- `sanitizeBranch(branch: string): string` — replaces `/` with `--`. Pure, no side effects.
- `commentPath(docPath: string, docBranch: string): string` — returns `.redraft/comments/<sanitized-branch>/<docPath with .md → .comments.json>`. Uses `sanitizeBranch` internally.

`src/lib/auth/storage.ts` additions:

- `getStoredSidecarBranch(owner: string, repo: string): string | null` — reads `redraft.sidecarBranch.<owner>/<repo>` from localStorage. Returns null if not set.
- `setStoredSidecarBranch(owner: string, repo: string, branch: string): void` — writes the key.

Follow the exact pattern of the existing `getStoredBranch` / `setStoredBranch` functions (JSON-serialized string, same error handling).

**Behavior:**

- `sanitizeBranch('main')` → `'main'`
- `sanitizeBranch('feature/auth')` → `'feature--auth'`
- `sanitizeBranch('a/b/c')` → `'a--b--c'`
- `commentPath('docs/auth.md', 'main')` → `'.redraft/comments/main/docs/auth.comments.json'`
- `commentPath('docs/auth.md', 'feature/auth')` → `'.redraft/comments/feature--auth/docs/auth.comments.json'`
- Storage round-trip: `setStoredSidecarBranch('acme', 'ws', 'redraft')` then `getStoredSidecarBranch('acme', 'ws')` → `'redraft'`

**Checklist:**

- [x] `sanitizeBranch` handles branches with no slashes (identity), single slash, multiple slashes
- [x] `commentPath` correctly composes the full path with sanitized branch prefix
- [x] Storage functions use key `redraft.sidecarBranch.<owner>/<repo>` (not colliding with `redraft.branch.*`)
- [x] `getStoredSidecarBranch` returns null for missing/malformed data (same guard as `getStoredBranch`)
- [x] Both new exports are re-exported from their respective index files

**Tests:**

- [x] `npx vitest run src/lib/comments/__tests__/paths.test.ts`
- [x] `npx vitest run src/lib/auth/__tests__/storage.test.ts`
- [x] Unit tests for `sanitizeBranch` with identity, single-slash, multi-slash branch names
- [x] Unit tests for `commentPath` with various doc paths and branch names
- [x] Storage round-trip, missing key returns null, malformed JSON returns null

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: add comment path utilities and sidecar branch storage`

### Task 2: Auth Context — Sidecar Branch State and Local Branch Detection

**Files:**

- Modify: `src/hooks/useAuth.ts` — add `sidecarBranch`, `setSidecarBranch`, and local-mode branch detection
- Modify: `src/hooks/__tests__/useAuth.test.tsx` — test sidecar branch state and local-mode branch
- Modify: `server/routes/git.ts` — add `GET /api/git/branch` endpoint
- Modify: `server/routes/git.test.ts` — test branch endpoint

**Interface:**

`AuthContextValue` gains:

- `sidecarBranch: string | null` — the active sidecar branch name. Defaults to `'redraft'` in remote mode. `null` in local mode (not needed for filesystem reads/writes; the local server handles git plumbing internally).
- `setSidecarBranch: (name: string) => void` — updates sidecar branch and persists to localStorage.

New server endpoint:

- `GET /api/git/branch` → `{ branch: "main" }` (current HEAD branch name). Uses `git rev-parse --abbrev-ref HEAD`. Returns 404 if not in a git repo (same pattern as other git routes).

**Behavior:**

**Remote mode** — mirrors the existing `branchState` pattern:

- On login: read `getStoredSidecarBranch(owner, repo)`. If found, use it. Otherwise, default to `'redraft'`.
- `setSidecarBranch(name)`: calls `setStoredSidecarBranch(owner, repo, name)`, updates state.
- On `updateRepo`: reset and reload sidecar branch state (defaulting to `'redraft'`).
- On `logout`: reset to `null`.

**Local mode** — `branch` changes from always-null to fetched from the local server:

- On mount, when `localMode` is true and `branch` is null, fetch `GET /api/git/branch` from the local server to get the current git branch.
- Set `branch` to the returned value. This enables `commentPath(path, branch)` to namespace sidecar paths correctly.
- `sidecarBranch` stays `null` — the frontend doesn't need it in local mode since the server handles sidecar branch git operations.
- `setBranch` and `setSidecarBranch` remain no-ops in local mode.
- If the git branch endpoint fails (not a git repo), fall back to `'main'` as the branch name for path namespacing.

`BranchState` interface gains `sidecarBranch: string | null`. `emptyBranchState()` returns `sidecarBranch: null`.

Add `sidecarBranch` and `setSidecarBranch` to the `useMemo` value and its dependency array.

**Checklist:**

- [x] `sidecarBranch` defaults to `'redraft'` on login when no stored override exists (remote mode)
- [x] `sidecarBranch` restores from localStorage if previously set (remote mode)
- [x] `setSidecarBranch` persists to localStorage and updates state (remote mode)
- [x] `updateRepo` resets and reloads sidecar branch state (default `'redraft'`)
- [x] `logout` clears sidecar branch state
- [x] `sidecarBranch` included in `useMemo` value and dependency array
- [x] `GET /api/git/branch` endpoint returns current branch name
- [x] Local mode: `branch` is fetched from server (no longer hardcoded null)
- [x] Local mode: falls back to `'main'` if git branch detection fails
- [x] Local mode: `sidecarBranch` is `null`, `setSidecarBranch` is a no-op

**Tests:**

- [x] `npx vitest run src/hooks/__tests__/useAuth.test.tsx`
- [x] `npx vitest run server/routes/git.test.ts`
- [x] Login uses default `'redraft'` when no persisted sidecar branch exists
- [x] Login restores persisted sidecar branch override
- [x] `setSidecarBranch` updates state and persists to localStorage
- [x] Local mode fetches branch from server and populates `branch`
- [x] Local mode `sidecarBranch` is null, `setSidecarBranch` is no-op
- [x] Mount with stored auth restores sidecar branch from localStorage
- [x] `GET /api/git/branch` returns current branch; 404 outside git repo

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: add sidecarBranch to auth context with local branch detection`

### Task 3: Update useComments Hook

**Files:**

- Modify: `src/hooks/useComments.ts` — use `sidecarBranch` for reads/writes, use shared `commentPath`
- Modify: `src/hooks/__tests__/useComments.test.ts` — update mock auth to include `sidecarBranch`, update assertions

**Behavior:**

The hook currently uses `branch` (the document branch) for both the sidecar file path and the GitHub ref/branch parameter. After this change:

1. Import `commentPath` from `src/lib/comments/paths` instead of the local `commentPath` function. Remove the local `commentPath` function.
2. Destructure `sidecarBranch` from `useAuth()` alongside `branch`.
3. Call `commentPath(path, branch!)` to compute the sidecar file path (now branch-namespaced). `branch` is always non-null when the query is enabled (see `enabled` guard below).
4. `getFileContent` ref changes from `branch` to `sidecarBranch` — reads come from the sidecar branch.
5. `createFile` / `updateFile` branch arg changes from `branch` to `sidecarBranch` — writes go to the sidecar branch.
6. Query key becomes `['document', path, 'comments', branch, sidecarBranch]` — cache invalidates when either branch changes.
7. `enabled` guard: `Boolean(client) && branch !== null && (isLocalMode() || sidecarBranch !== null)`. Both modes require `branch` for path computation. Remote mode additionally requires `sidecarBranch`.

**Error handling:** If `branch` or `sidecarBranch` is null, the query stays disabled and comments don't load. This is correct — the auth context hasn't resolved yet. In local mode, `sidecarBranch` is always null but not needed (the server reads from disk, not a git ref).

**Checklist:**

- [x] Local `commentPath` function removed, replaced with import from `src/lib/comments/paths`
- [x] `sidecarBranch` destructured from `useAuth()`
- [x] `commentPath()` called with `(path, branch!)` — document branch for namespacing (non-null when enabled)
- [x] `getFileContent` uses `ref: sidecarBranch` (not `branch`)
- [x] `createFile` / `updateFile` use `sidecarBranch` as branch arg (not `branch`)
- [x] Query key includes both `branch` and `sidecarBranch`
- [x] `enabled` guard checks both `branch` and `sidecarBranch` are non-null in remote mode
- [x] Reset effect dependency array includes `sidecarBranch` if appropriate

**Tests:**

- [x] `npx vitest run src/hooks/__tests__/useComments.test.ts`
- [x] Update mock `useAuth` return to include `sidecarBranch: 'redraft'`
- [x] Verify `getFileContent` is called with `ref: 'redraft'` (the sidecar branch, not the document branch)
- [x] Verify `createFile` / `updateFile` are called with `'redraft'` as the branch arg
- [x] Verify the sidecar file path includes the sanitized document branch: `.redraft/comments/dev/docs/doc.comments.json`

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: route comment reads/writes to sidecar branch`

### Task 4: Update useDocuments Hook — Dual Tree Fetch

**Files:**

- Modify: `src/hooks/useDocuments.ts` — dual tree fetch, import shared `commentPath`, filter by branch subdirectory
- Modify: `src/hooks/__tests__/useDocuments.test.tsx` — update mocks and assertions

**Behavior:**

The hook currently calls `getTree(branch)` once and scans for both `.md` blobs and `.redraft/comments/` sidecars in the same tree. After this change:

1. Import `commentPath` from `src/lib/comments/paths`. Remove the local `commentPath` function.
2. Destructure `sidecarBranch` from `useAuth()`.
3. Compute the expected sidecar prefix: `.redraft/comments/<sanitized-branch>/` using `sanitizeBranch(branch)`.
4. When `sidecarBranch !== branch` and both are non-null:
   - Fire `getTree(branch)` and `getTree(sidecarBranch)` in parallel (use `Promise.all`).
   - From the document tree: extract `.md` blobs (unchanged).
   - From the sidecar tree: filter to paths starting with the computed prefix.
5. When `sidecarBranch === branch` (or sidecar branch is null):
   - Single `getTree(branch)` call.
   - Filter sidecar paths to the computed prefix (narrower than today's `.redraft/comments/` prefix).
6. Under-review detection: a markdown document is under review when `commentPath(item.path, branch)` appears in the sidecar path set.
7. Query key becomes `['documents', 'tree', branch, sidecarBranch]`.

**Error handling for missing sidecar branch:**
When the sidecar tree fetch returns a 404 (branch doesn't exist):

- Dispatch a toast via the existing toast event mechanism: "Branch 'redraft' not found. Create it with the setup script or update the branch name in Settings."
- Treat the sidecar tree as empty — no documents are marked as under review.
- Do NOT fail the entire query — document listing should still work.

**Checklist:**

- [x] Local `commentPath` removed, shared import used
- [x] `sidecarBranch` from `useAuth()` used
- [x] `Promise.all` for dual tree fetch when branches differ
- [x] Sidecar paths filtered to `.redraft/comments/<sanitized-branch>/` prefix (not the broad `.redraft/comments/` prefix)
- [x] Single tree fetch when `sidecarBranch === branch`
- [x] Under-review detection uses `commentPath(item.path, branch)` for matching
- [x] Query key includes both `branch` and `sidecarBranch`
- [x] 404 on sidecar tree fetch shows toast, doesn't fail the query
- [x] Document tree still loads when sidecar tree is unavailable

**Tests:**

- [x] `npx vitest run src/hooks/__tests__/useDocuments.test.tsx`
- [x] Update mock `useAuth` to include `sidecarBranch`
- [x] Test dual tree fetch: mock `getTree` to return different results for doc branch vs sidecar branch; verify under-review detection uses sidecar tree data
- [x] Test single tree fetch: when `sidecarBranch === branch`, verify one `getTree` call
- [x] Test sidecar branch 404: mock `getTree` to throw for sidecar branch, verify documents still load and toast is dispatched
- [x] Test branch-namespaced sidecar detection: sidecar at `.redraft/comments/dev/docs/auth.comments.json` correctly matches `docs/auth.md` when document branch is `dev`

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: dual tree fetch for sidecar branch detection`

### Task 5: Settings UI — Comments Branch Input

**Files:**

- Modify: `src/routes/Settings.tsx` — add "Comments branch" field
- Modify: `src/components/layout/__tests__/AppLayout.test.tsx` — update if Settings rendering is tested

**Behavior:**

Add a "Comments branch" text input to the Settings page, **below** the existing "Repository" form, **only in remote mode** (not shown when `localMode` is true).

- Label: "Comments branch"
- Helper text below the input: "Branch where review comments are stored. Default: redraft"
- Default/initial value: `sidecarBranch` from `useAuth()`, falling back to `'redraft'` if null
- On form submit (can be the same form or a separate small form), call `setSidecarBranch(value)` from `useAuth()`
- Show a confirmation message on save (same pattern as the existing "Repository updated." message)

Destructure `sidecarBranch` and `setSidecarBranch` from `useAuth()`.

**Checklist:**

- [x] "Comments branch" input appears only in remote mode
- [x] Input pre-populated with current `sidecarBranch` value
- [x] Save calls `setSidecarBranch` with the input value
- [x] Confirmation message shown after save
- [x] Input follows the existing Settings page styling (same form structure, label pattern)
- [x] Not rendered in local mode section of Settings

**Tests:**

- [x] `npx vitest run src/routes src/components/layout`
- [x] Settings in remote mode renders "Comments branch" input
- [x] Settings in local mode does not render "Comments branch" input
- [x] Saving the form calls `setSidecarBranch` with the entered value

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: add comments branch setting to Settings page`

### Task 6: Local Server — Git Commit Route Split

**Files:**

- Modify: `server/routes/git.ts` — exclude `.redraft/` from doc commits, add plumbing sidecar commit
- Modify: `server/routes/git.test.ts` — integration tests for both commit paths
- Modify: `server/routes/index.ts` — pass sidecar branch to git route helpers (if needed)

**Interface:**

`GitRouteHelpers` gains:

- `sidecarBranch: string` — the sidecar branch name, provided from the CLI flag. Default: `'redraft'`.

The existing `POST /api/git/commit` route splits its work:

1. **Document commit** (existing behavior, modified):
   - `git add -- <scope> ':!<relativeScope>/.redraft/'` — excludes `.redraft/` relative to the served directory scope. When serving a subdirectory like `docs/`, the exclusion pathspec must be `':!docs/.redraft/'`, not `':!.redraft/'`.
   - `git commit` — as before.
   - If no document changes are staged after exclusion, skip the document commit (don't error on empty).

2. **Sidecar commit** (new plumbing path):
   - Check if `.redraft/` has changes: `git status --porcelain -- <relativeScope>/.redraft/` scoped to the served directory. All `.redraft/` pathspecs MUST be prefixed with `relativeScope` from `getRepoContext()` to handle subdirectory-served repos.
   - If there are sidecar changes, commit them to the sidecar branch using git plumbing:
     a. Create a temp index file (use `os.tmpdir()` + unique name).
     b. If the sidecar branch ref exists (`git rev-parse refs/heads/<sidecarBranch>`), read its tree into the temp index: `GIT_INDEX_FILE=<tmp> git read-tree <sidecarBranch>`.
     c. For each changed sidecar file, add it to the temp index: `GIT_INDEX_FILE=<tmp> git update-index --add --cacheinfo 100644,<blob-hash>,<path>` where blob-hash comes from `git hash-object -w <file>`.
     d. Write the tree: `GIT_INDEX_FILE=<tmp> git write-tree` → tree SHA.
     e. Create the commit: `git commit-tree <tree> [-p <parent>] -m "Update review comments"`. If the sidecar branch exists, `-p` is the current tip. If it doesn't exist (first commit), omit `-p` for an orphan root commit.
     f. Update the ref: `git update-ref refs/heads/<sidecarBranch> <commit>`.
     g. Clean up the temp index file.
   - All plumbing commands use `env: { GIT_INDEX_FILE: tmpPath }` — never touch the real index.
   - Use git config for author: `-c user.name=ReDraft -c user.email=redraft@local` on `commit-tree` (via `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` env vars, since `commit-tree` doesn't accept `-c`).

3. **Response**: Return both SHAs (document commit SHA if any, sidecar commit SHA if any). The response shape can extend the current `{ sha, message }` — e.g., `{ sha, message, sidecar?: { sha: string, message: string } }`.

**Error handling:**

- If plumbing fails mid-way, the ref hasn't been updated yet (it's the last step), so no corruption. Clean up temp index in a `finally` block.
- If the repo is not a git repository, the existing 404 error from `getRepoContext` handles it.
- If no changes exist for either documents or sidecars, return success with appropriate indication.

**Checklist:**

- [x] `git add` for documents excludes `.redraft/` via scope-relative pathspec (e.g., `':!docs/.redraft/'` when serving `docs/`)
- [x] Empty document commits don't error (skip gracefully)
- [x] Sidecar changes detected via `git status --porcelain -- <relativeScope>/.redraft/`
- [x] Git plumbing uses a temp index file — never touches the real index
- [x] Temp index cleaned up in a `finally` block
- [x] Orphan commit created when sidecar branch doesn't exist yet
- [x] Parent commit used when sidecar branch already exists
- [x] Author/committer set via env vars for `commit-tree`
- [x] Response includes sidecar commit info when applicable
- [x] `GitRouteHelpers` extended with `sidecarBranch` property

**Tests:**

- [x] `npx vitest run server/routes/git.test.ts`
- [x] Document-only commit: change a `.md` file, commit, verify `.redraft/` is not staged
- [x] Sidecar-only commit: change a `.redraft/` file, commit, verify sidecar branch has the file and working tree is untouched
- [x] Mixed commit: change both `.md` and `.redraft/` files, verify documents go to current branch and sidecars go to sidecar branch
- [x] First sidecar commit (orphan): verify sidecar branch is created as orphan
- [x] Subsequent sidecar commit: verify parent chain on sidecar branch
- [x] No changes: commit with nothing dirty returns gracefully
- [x] Subdirectory-served repo: verify pathspecs use relative scope (test with a non-root basePath)

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: split git commit route for sidecar branch plumbing`

### Task 7: CLI Flag and Server Wiring

**Files:**

- Modify: `server/cli.ts` — add `--sidecar-branch` option
- Modify: `server/app.ts` — thread `sidecarBranch` through to route helpers
- Modify: `server/routes/index.ts` — pass `sidecarBranch` to `buildGitHubApiRouter` and down to git route helpers

**Behavior:**

Add `--sidecar-branch <string>` to the Commander CLI options via `registerServeOptions`:

- Default value: `'redraft'`
- Description: "Git branch for sidecar comment files (default: redraft)"

Thread the value through:

1. `ServeOptions` interface gains `sidecarBranch?: string`.
2. `runServe` passes it to `startReDraftServer`.
3. `ReDraftServerOptions` / `ReDraftAppOptions` gain `sidecarBranch: string` (with default `'redraft'`).
4. `buildReDraftApp` passes it to `buildGitHubApiRouter`.
5. `buildGitHubApiRouter` passes it in the helpers object to `registerGitRoute`.

**Checklist:**

- [x] `--sidecar-branch` option added to both the default command and the `serve` subcommand (via `registerServeOptions`)
- [x] Default value is `'redraft'`
- [x] Value threaded through `ServeOptions` → `ReDraftServerOptions` → `ReDraftAppOptions` → `buildGitHubApiRouter` → git route helpers
- [x] No other routes need the sidecar branch — only git route uses it

**Tests:**

- [x] `npx vitest run server/`
- [x] Existing server tests still pass (sidecar branch defaults to `'redraft'` when not specified)
- [x] The git route integration tests from Task 6 verify the sidecar branch is used correctly

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: add --sidecar-branch CLI flag`

### Task 8: Local Server — Filesystem Operations for Branch-Namespaced Paths

**Files:**

- Modify: `server/fs/operations.ts` — update `documentPathFromCommentPath()`, `walkCommentFiles()`, `listReviewEntries()` for branch-namespaced paths
- Modify: `server/fs/operations.test.ts` — update tests for new path scheme
- Modify: `server/fs/watcher.ts` — update comment file detection if it uses the old path prefix
- Modify: `server/fs/watcher.test.ts` — update tests

**Behavior:**

The local server filesystem operations need to understand the new branch-namespaced sidecar path scheme:

1. **`COMMENTS_ROOT`** stays `.redraft/comments` — the top-level directory is unchanged.

2. **`walkCommentFiles(basePath, branch?)`** — the function currently walks all `.comments.json` files under `.redraft/comments/`. After this change:
   - If `branch` is provided, walk only `.redraft/comments/<sanitized-branch>/` subdirectory.
   - If no `branch` provided (backward compat for non-scoped callers), walk all subdirectories.
   - Import `sanitizeBranch` from `src/lib/comments/paths` — or, since server code may not share frontend imports, duplicate the simple `/` → `--` replacement as a server-side utility.

3. **`documentPathFromCommentPath(commentPath)`** — currently strips the `COMMENTS_ROOT/` prefix and converts `.comments.json` → `.md`. After the change, it ALSO needs to strip the branch subdirectory. The path `.redraft/comments/main/docs/auth.comments.json` should produce `docs/auth.md`, not `main/docs/auth.md`. Implementation: after stripping `COMMENTS_ROOT/`, strip the first path segment (the branch name).

4. **`listReviewEntries(basePath, branch?)`** — gains an optional `branch` parameter. When provided, scopes `walkCommentFiles` to that branch subdirectory. The tree route (`server/routes/tree.ts`) should pass the current branch (detected via `git rev-parse --abbrev-ref HEAD`, same as the new `/api/git/branch` endpoint).

5. **Watcher** (`server/fs/watcher.ts`) — the `COMMENTS_ROOT` prefix check may need updating if it filters by path prefix. Verify the watcher correctly detects changes in branch-namespaced subdirectories.

**Checklist:**

- [x] `documentPathFromCommentPath('.redraft/comments/main/docs/auth.comments.json')` → `'docs/auth.md'`
- [x] `documentPathFromCommentPath('.redraft/comments/feature--auth/docs/auth.comments.json')` → `'docs/auth.md'`
- [x] `walkCommentFiles(basePath, 'main')` only returns files under `.redraft/comments/main/`
- [x] `walkCommentFiles(basePath)` returns files under all branch subdirectories
- [x] `listReviewEntries` correctly scopes to a specific branch
- [x] Watcher detects changes in branch-namespaced subdirectories
- [x] `sanitizeBranch` logic available server-side (shared or duplicated)

**Tests:**

- [x] `npx vitest run server/fs/operations.test.ts server/fs/watcher.test.ts`
- [x] `documentPathFromCommentPath` strips branch prefix correctly
- [x] `walkCommentFiles` with branch parameter scopes to correct subdirectory
- [x] `listReviewEntries` returns correct document paths with branch-namespaced sidecars
- [x] Existing watcher tests pass with branch-namespaced paths

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: update local server fs operations for branch-namespaced sidecar paths`

### Task 9: Sidecar Branch Missing — Error UX

**Files:**

- Modify: `src/hooks/useDocuments.ts` — toast dispatch on sidecar 404 (if not already done in Task 4)
- Modify: `src/lib/github/client.ts` — ensure `getTree` throws a distinguishable error when the branch doesn't exist
- Modify: `src/components/comments/CommentsSidebar.tsx` (or equivalent) — inline error message when sidecar branch is unavailable
- Create or modify: relevant test files for error states

**Behavior:**

This task ensures the error UX from the spec is fully wired. A key prerequisite is **distinguishing "branch not found" from "file not found"**:

1. **`getTree(sidecarBranch)` already throws on 404** — `GitHubClient.getTree` does not have an `optional` mode; a 404 is a thrown `NotFoundError`. This makes branch-missing detection straightforward in `useDocuments`. Catch the error, check if it's a `NotFoundError`, and treat the sidecar tree as empty instead of failing the query.

2. **`getFileContent` with `optional: true` swallows all 404s** — In `useComments`, a missing sidecar branch returns `null` (same as missing file), making it indistinguishable. To detect the missing branch in the comments sidebar, either:
   a. Have `useDocuments` expose a `sidecarBranchExists: boolean` flag (derived from whether the sidecar tree fetch succeeded). The comments sidebar reads this flag from the parent context.
   b. Or, do a lightweight branch-existence check (e.g., `getTree` call) in the comments hook.
   **Option (a)** is preferred — single source of truth, no redundant API calls.

3. **Toast on sidecar tree fetch failure**:
   - When `getTree(sidecarBranch)` throws a `NotFoundError` in `useDocuments`, dispatch a toast: "Branch '<name>' not found. Create it with the setup script or update the branch name in Settings."
   - Fire the toast once per branch-change, not on every re-render. Use a ref to track whether the toast has been shown for the current sidecar branch.

4. **Inline message in comments sidebar**:
   - Read `sidecarBranchExists` from the documents/query context.
   - When `false`, show an inline message instead of the comment form: "Comments branch '<name>' does not exist."
   - Save button hidden or disabled.

**Checklist:**

- [x] `useDocuments` catches `NotFoundError` from sidecar tree fetch and sets `sidecarBranchExists` flag
- [x] Toast fires on sidecar tree 404 in `useDocuments`
- [x] Toast fires only once per branch-change, not repeatedly
- [x] `sidecarBranchExists` flag exposed for comments sidebar consumption
- [x] Comments sidebar shows inline error when sidecar branch is missing
- [x] Save/comment actions disabled when sidecar branch is unavailable
- [x] Error state is visually consistent with existing app error patterns

**Tests:**

- [x] Verify toast dispatch on sidecar branch 404
- [x] Verify `sidecarBranchExists` is false when sidecar tree fetch fails
- [x] Verify sidebar renders inline error message when sidecar branch is missing
- [x] Verify comment form is not shown / save is disabled in error state

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: error UX for missing sidecar branch`

### Task 10: Test Fixtures Submodule Update

**Files:**

- Modify: `test-fixtures/` submodule (`tcamise-gpsw/redraft-test-repo`)
- Modify: root repo submodule pointer

**Behavior:**

Update the test-fixtures repo to reflect the new sidecar path scheme:

1. **On `main` branch of test-fixtures repo:**
   - Remove `.redraft/comments/api-design-v2.comments.json` (old un-namespaced path).
   - Ensure no `.redraft/` directory remains on `main`.

2. **Create an orphan `redraft` branch:**
   - Use the setup script pattern: `git checkout --orphan redraft && git rm -rf . && git commit --allow-empty -m "Initialize sidecar branch"`.
   - Add namespaced sidecar files:
     - `.redraft/comments/main/api-design-v2.comments.json` — the existing comment data, moved to the branch-namespaced path.
   - Optionally add a second branch namespace for testing: `.redraft/comments/feature--example/api-design-v2.comments.json` with a different comment set.
   - Commit and push.

3. **Update the submodule pointer** in the main redraft repo to the new commit on `main` of test-fixtures.

**Checklist:**

- [x] Old sidecar path removed from `main` branch of test-fixtures
- [x] Orphan `redraft` branch created in test-fixtures repo
- [x] Branch-namespaced sidecar files present on `redraft` branch
- [x] Submodule pointer updated in the main repo
- [x] Existing tests that reference test-fixtures data are updated if they depend on old sidecar paths

**Tests:**

- [x] `npx vitest run` — all tests pass with updated fixtures

**Commit:**

- [x] Read `skill://commit`, commit with message like `chore: update test-fixtures submodule for sidecar branch paths`

### Task 11: Setup Script

**Files:**

- Create: `scripts/create-sidecar-branch.sh` — orphan branch creation script

**Behavior:**

A simple shell script that creates an orphan sidecar branch:

- Accepts an optional argument for the branch name (default: `redraft`).
- Creates an orphan branch: `git checkout --orphan <branch>`.
- Removes all tracked files from the index: `git rm -rf .`.
- Creates an empty initial commit: `git commit --allow-empty -m "Initialize ReDraft sidecar branch"`.
- Switches back to the previous branch: `git checkout -`.
- Prints instructions: "Created orphan branch '<branch>'. Push with: git push origin <branch>".

The script should be executable (`chmod +x`).

**Checklist:**

- [x] Script is executable
- [x] Default branch name is `redraft`
- [x] Custom branch name accepted as first argument
- [x] Creates orphan branch (no parent commit, no files)
- [x] Returns to previous branch after creation
- [x] Prints push instructions

**Tests:**

- [x] Manual verification: run the script in a test repo, verify orphan branch exists with empty tree

**Commit:**

- [x] Read `skill://commit`, commit with message like `feat: add sidecar branch setup script`

### Task 12: Final Validation

**Checks:**

- [x] Full test suite passes: `npx vitest run`
- [x] Type check passes: `npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json`
- [x] Lint passes: `npx eslint src/ server/`
- [x] Format check passes: `npx prettier --check src/ server/`
- [x] All acceptance criteria verified:
  - Comment reads use sidecar branch ref
  - Comment writes target sidecar branch
  - Document tree detects under-review status from sidecar branch
  - Dual tree fetch fires when branches differ
  - Single tree fetch when branches match
  - Settings UI shows "Comments branch" in remote mode only
  - Local server excludes `.redraft/` from document commits
  - Local server commits sidecars to sidecar branch via plumbing
  - Local server fs operations handle branch-namespaced paths correctly
  - Local mode detects current git branch for path namespacing
  - `--sidecar-branch` CLI flag works with default `'redraft'`
  - Missing sidecar branch shows toast + inline error
  - Setup script creates orphan branch
  - Test-fixtures submodule updated with branch-namespaced paths
- [x] No regressions: existing document editing, branch switching, and local mode all still work
