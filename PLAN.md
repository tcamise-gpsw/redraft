# Local Sidecar Git-Backed Implementation Plan

**Goal:** Make the local server read/write comment sidecars from the Git sidecar branch (via plumbing) instead of the filesystem, so local and remote modes share the same comment storage.

**Architecture:** The local server's contents route gains a branch-parameter check: if `?ref` (reads) or `body.branch` (writes) is present, operations route through a new `git-sidecar` module that reads/writes files on a named branch without checking it out. The tree route switches from walking the filesystem for sidecars to `git ls-tree` on the sidecar branch. The frontend already sends these parameters — it just needs to pass `sidecarBranch` to the local tree fetch.

**Tech Stack:** Node.js `child_process.execFile` for git plumbing, existing `FileOperationError` for error propagation, Vitest for unit/integration tests, Playwright for E2E regression.

**Spec:** `docs/specs/2026-07-10-local-sidecar-git-backed-design.md`

---

### Task 1: Git Sidecar Module

**Files:**

- Create: `server/fs/git-sidecar.ts` — git plumbing operations for reading/writing files on a named branch
- Test: `server/fs/git-sidecar.test.ts`

**Interface:**

All functions accept `repoRoot: string` (cwd for git commands) and `branch: string` (the sidecar branch name, e.g. `redraft`).

- `readGitFile(repoRoot, branch, path) → Promise<{ content: Buffer, sha: string }>`
- `writeGitFile(repoRoot, branch, path, content: Buffer, expectedSha: string, message: string) → Promise<{ sha: string }>`
- `createGitFile(repoRoot, branch, path, content: Buffer, message: string) → Promise<{ sha: string }>`
- `deleteGitFile(repoRoot, branch, path, expectedSha: string) → Promise<void>`
- `listSidecarEntries(repoRoot, sidecarBranch, docBranch: string) → Promise<ReviewEntry[]>`

Import `FileOperationError` from `../types.js` for error responses. Import `computeBlobSha` from `./operations.js` for SHA computation. Import `ReviewEntry` from `../types.js`.

**Behavior:**

`readGitFile`:

- Run `git show <branch>:<path>` with `encoding: 'buffer'`. Return the stdout as content, compute SHA with `computeBlobSha`.
- If the command fails (branch or path doesn't exist), throw `FileOperationError(404, ...)`.

`writeGitFile` (conflict-checked update):

- Get current blob SHA: `git rev-parse <branch>:<path>`. If this fails, throw `FileOperationError(404)`.
- Compare with `expectedSha`. If mismatch, throw `FileOperationError(409, 'SHA mismatch ...')`.
- Write content to a temp file via `fs.writeFile` in a `mkdtemp` dir.
- `git hash-object -w <temp-file>` → blob SHA.
- Create a temp index via `GIT_INDEX_FILE` env var (same pattern as `commitSidecars` in `server/routes/git.ts`).
- `git read-tree <branch>` into the temp index.
- `git update-index --add --cacheinfo 100644,<blobSha>,<path>`.
- `git write-tree` → tree SHA.
- If tree SHA equals parent tree SHA, return the existing blob SHA (no-op).
- `git commit-tree <treeSha> -p <parentSha> -m <message>` with env `GIT_AUTHOR_NAME=ReDraft`, `GIT_AUTHOR_EMAIL=redraft@local`, same for committer.
- `git update-ref refs/heads/<branch> <commitSha>`.
- Clean up temp dir in `finally`.
- Return `{ sha: newBlobSha }`.

`createGitFile`:

- Same plumbing as `writeGitFile` but skip the SHA check step. If the branch exists, `git read-tree` into the temp index before adding. If the branch doesn't exist, start with an empty index.
- Return `{ sha: blobSha }`.

`deleteGitFile`:

- Get current SHA, compare with `expectedSha` (same as writeGitFile).
- `git read-tree`, `git update-index --force-remove <path>`, write-tree, commit-tree, update-ref.

`listSidecarEntries`:

- `git ls-tree -r --name-only <sidecarBranch>`. If fails (branch missing), return `[]`.
- Define `sanitizeBranch(branch: string): string` locally in `git-sidecar.ts` — it's `branch.replaceAll('/', '--')`. Don't import from `src/lib/comments/paths.ts` (that's a frontend module).
- Filter output lines matching `.redraft/comments/<sanitizedDocBranch>/` and ending in `.comments.json`.
- For each match, `git show <sidecarBranch>:<path>`, parse JSON, count entries where `resolved !== true`.
- Derive the document path: strip `.redraft/comments/<sanitizedDocBranch>/` prefix and replace `.comments.json` with `.md`.
- Return `ReviewEntry[]` sorted by path.

**Checklist:**

- [x] All five functions implemented
- [x] Uses `FileOperationError(404)` for missing branch/path, `FileOperationError(409)` for SHA mismatch
- [x] Temp index and temp files cleaned up in `finally` blocks
- [x] ReDraft committer identity matches existing `commitSidecars` convention
- [x] `listSidecarEntries` returns `[]` when sidecar branch doesn't exist (not an error)

**Tests:**

- [x] Run: `npx vitest run server/fs/git-sidecar.test.ts`
- [x] Test setup: create temp dir with `git init`, configure user.name/email, create an orphan `redraft` branch with a seeded `.redraft/comments/main/test-doc.comments.json` containing one resolved and one unresolved thread. Follow the same `beforeEach`/`afterEach` temp-repo pattern used in `server/routes/git.test.ts`.
- [x] `readGitFile`: reads content and SHA correctly; throws 404 for missing branch; throws 404 for missing path on valid branch
- [x] `writeGitFile`: updates content, returns new SHA, persists (verify with `git show`); throws 409 on SHA mismatch; throws 404 when path doesn't exist
- [x] `createGitFile`: creates new file, returns SHA, persists; handles deeply nested paths (e.g. `.redraft/comments/main/docs/nested/file.comments.json`)
- [x] `deleteGitFile`: removes file from branch (verify 404 on subsequent read); throws on SHA mismatch
- [x] `listSidecarEntries`: returns correct `{ path, unresolvedCount }` entries; returns `[]` for non-existent branch; filters to the correct doc branch prefix (ignores sidecars for other branches)

**Commit:**

- [ ] Read `skill://commit`, stage and commit: `feat(server): add git-sidecar module for branch-backed sidecar operations`

---

### Task 2: Contents Route — Git Branch Routing

**Files:**

- Modify: `server/routes/contents.ts` — add branch-parameter checks to route sidecar ops through git

**Interface:**

Add `branch?: string` to the `ContentRequestBody` interface.

The route helpers already receive `basePath`. The git-sidecar functions use `basePath` as `repoRoot`.

**Behavior:**

Each handler gains a branch check at the top:

**GET handler:**

- Read `c.req.query('ref')`. If present, call `readGitFile(helpers.basePath, ref, localPath)` and return the same `{ type: 'file', sha, content }` shape.
- If absent, fall through to existing `readFile` (filesystem) — unchanged.

**PUT handler:**

- Parse body. If `body.branch` is set:
  - Try `writeGitFile(helpers.basePath, body.branch, localPath, decodedContent, body.sha, body.message)`.
  - If it throws 404 and `!body.sha` (first-time create), fall through to `createGitFile` — same create-on-404 fallback pattern that exists today for filesystem writes.
  - Return `{ content: { sha } }`.
- If `body.branch` is absent, fall through to existing filesystem write — unchanged.

**POST handler:**

- If `body.branch` is set, call `createGitFile`.
- Otherwise, existing filesystem create.

**DELETE handler:**

- If `body.branch` is set, call `deleteGitFile`.
- Otherwise, existing filesystem delete.

**Checklist:**

- [x] All four handlers have the branch check
- [x] Filesystem path (no ref/branch) is completely unchanged — no behavioral difference for document reads/writes
- [x] `ContentRequestBody` includes `branch?: string`
- [x] The PUT create-on-404 fallback works for git path (same pattern as filesystem)
- [x] Import `readGitFile`, `writeGitFile`, `createGitFile`, `deleteGitFile` from `../fs/git-sidecar.js`

**Tests:**

- [x] Run: `npx vitest run server/routes/contents.test.ts`
- [x] Existing filesystem tests pass unchanged (regression)
- [x] New tests: GET with `?ref=<branch>` reads from git; PUT with `body.branch` writes to git; POST with `body.branch` creates on git; DELETE with `body.branch` deletes from git
- [x] The route integration tests need a seeded git repo — extend the test setup to create one with an orphan sidecar branch (can share the pattern with git-sidecar.test.ts)

**Commit:**

- [ ] Read `skill://commit`, stage and commit: `feat(server): route sidecar requests through git plumbing in contents route`

---

### Task 3: Tree Route — Git-Backed Under Review List

**Files:**

- Modify: `server/routes/tree.ts` — use git sidecar listing instead of filesystem walk
- Modify: `server/routes/index.ts` — add `sidecarBranch` to `TreeRouteHelpers` type

**Interface:**

The tree route handler reads `c.req.query('sidecarBranch')`, falling back to `helpers.sidecarBranch`.

Add `sidecarBranch: string` to the helpers object type used by tree route (either extend `TreeRouteHelpers` or use the existing helpers object which already has `sidecarBranch` on it at runtime — just needs the type to reflect it).

**Behavior:**

- Read `sidecarBranch` from query param `c.req.query('sidecarBranch')` or fall back to `helpers.sidecarBranch`.
- Replace the `listReviewEntries(helpers.basePath, branch)` call with `listSidecarEntries(helpers.basePath, sidecarBranch, branch)` from the git-sidecar module.
- `listSidecarEntries` returns `ReviewEntry[]` with actual `unresolvedCount` — same shape as today.
- If the sidecar branch doesn't exist, `listSidecarEntries` returns `[]` — same as today when `.redraft/comments/` dir is missing.

**Checklist:**

- [x] Tree route accepts `sidecarBranch` query parameter
- [x] Documents still come from filesystem walk (unchanged)
- [x] Under Review list comes from git sidecar branch
- [x] Falls back to configured sidecar branch when query param absent
- [x] `sidecarBranch` is typed on the helpers object

**Tests:**

- [x] Run: `npx vitest run server/routes/tree.test.ts`
- [x] Existing document-tree tests pass unchanged
- [x] New test: tree request with `?sidecarBranch=redraft` returns underReview entries from the git branch
- [x] New test: tree request with non-existent sidecar branch returns empty underReview
- [x] Test setup needs a seeded git repo with an orphan sidecar branch containing comment sidecars

**Commit:**

- [ ] Read `skill://commit`, stage and commit: `feat(server): read under-review list from git sidecar branch`

---

### Task 4: Frontend — Hydrate Local Sidecar Branch and Pass to Tree Fetch

**Files:**

- Modify: `src/hooks/useAuth.ts` — set `sidecarBranch` to `'redraft'` (default) in local mode instead of `null`
- Modify: `src/hooks/useDocuments.ts` — pass `sidecarBranch` to `fetchLocalTree`

**Interface:**

`fetchLocalTree(baseUrl, owner, repo, sidecarBranch: string | null)` — add the fourth parameter. Append `&sidecarBranch=<value>` to the URL when non-null.

**Behavior:**

**Critical fix in `useAuth.ts`:** In local mode (line 301), `sidecarBranch` is currently hardcoded to `null`. This means `useComments` passes `undefined` for both `ref` (reads) and `branch` (writes), so the server never routes to git plumbing. Fix: set `sidecarBranch` to `'redraft'` (the conventional default) in the local mode branch-state initialization:

```
setBranchState({ branch, defaultBranch: null, sidecarBranch: 'redraft' });
```

Also check the CLI `--sidecar-branch` option. If the user configured a non-default sidecar branch via CLI, the server knows about it but the frontend doesn't. For now, hardcode `'redraft'` — the Settings page lets the user change it at runtime, and the value persists in localStorage. A future enhancement could pass the server's configured sidecar branch to the frontend via the `/api/health` endpoint.

**`fetchLocalTree` change:**

- Constructs the URL as `${baseUrl}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1&sidecarBranch=${sidecarBranch}` when `sidecarBranch` is non-null.
- In `useDocuments`, the call site passes `sidecarBranch` from `useAuth()` to `fetchLocalTree()`.

**Checklist:**

- [x] `useAuth.ts`: local mode sets `sidecarBranch: 'redraft'` instead of `null`
- [x] `fetchLocalTree` accepts and passes `sidecarBranch`
- [x] `useDocuments` passes `sidecarBranch` from auth state
- [x] `useComments` now receives a non-null `sidecarBranch` in local mode, so `ref` and `branch` params are sent to the server

**Tests:**

- [x] Run: `npx vitest run src/hooks/__tests__/useAuth.test.tsx src/hooks/__tests__/useDocuments.test.ts`
- [x] Verify the local-mode auth state test expects `sidecarBranch: 'redraft'` instead of `null`
- [x] Existing tests pass (update assertions/mocks for the new sidecarBranch value)
- [x] Type check: `npx tsc --noEmit`

**Commit:**

- [ ] Read `skill://commit`, stage and commit: `feat(auth): hydrate sidecar branch in local mode and pass to tree fetch`

---

### Task 5: Dead Code Removal

**Files:**

- Modify: `server/fs/operations.ts` — remove `walkCommentFiles`, `listReviewEntries`, and the `COMMENTS_ROOT` constant
- Modify: `server/routes/tree.ts` — remove import of `listReviewEntries` from operations (replaced by `listSidecarEntries` from git-sidecar in Task 3)

**Behavior:**

After Tasks 2 and 3, the following are unused:

- `walkCommentFiles` (private function) — walked `.redraft/comments/` on disk
- `listReviewEntries` (exported) — called `walkCommentFiles` and parsed JSON for unresolved counts
- `COMMENTS_ROOT` constant — used only by the above
- `sanitizeBranch` in operations.ts — used only by `walkCommentFiles` (the frontend has its own copy in `src/lib/comments/paths.ts`, and the git-sidecar module defines its own inline)
- `isCommentFile` helper — used only by `walkCommentFiles`

Also check if any imports of `listReviewEntries` or `walkCommentFiles` remain in other files.

**Checklist:**

- [ ] `walkCommentFiles`, `listReviewEntries`, `sanitizeBranch` (in operations.ts), `isCommentFile`, and `COMMENTS_ROOT` removed
- [ ] No remaining imports of removed symbols (verify with grep or LSP references)
- [ ] All other exports from `operations.ts` (`readFile`, `writeFile`, `createFile`, `deleteFile`, `walkMarkdownFiles`, `computeBlobSha`, `listFiles`) still intact

**Tests:**

- [ ] Run: `npx vitest run server/`
- [ ] All server tests pass
- [ ] Type check: `npx tsc --noEmit -p server/tsconfig.json`

**Commit:**

- [ ] Read `skill://commit`, stage and commit: `refactor(server): remove filesystem-based sidecar helpers`

---

### Task 6: E2E Browser Testing — Local Mode

Using the `e2e-browser-testing` skill, perform a manual browser-driven local mode test.

**Setup:**

- Build the frontend: `npm run build`
- Start the local server against a repo that has a `redraft` sidecar branch with at least one seeded comment sidecar (e.g., `~/gopro/FUZZ-MONKEY` or the test-fixtures submodule). If no sidecar data exists, seed it first by committing a `.redraft/comments/main/<doc>.comments.json` to the `redraft` branch of the target repo via git plumbing.

**Test scenarios:**

1. Open the local ReDraft UI. Verify "Under Review" shows the document(s) with existing sidecar data.
2. Click the document in "Under Review". Verify existing comments render in the sidebar.
3. Open a document WITHOUT existing comments. Select text, add a comment, save. Verify:
   - The comment appears in the sidebar
   - The sidecar file was committed to the `redraft` branch (check via `git show redraft:<sidecar-path>` on the command line)
4. Reload the page. Verify the comment persists (read from git, not transient state).
5. Reply to the comment, save. Verify the reply persists to git.
6. Resolve the thread, save. Verify the resolved state persists to git.

**Checklist:**

- [ ] Under Review list populates from sidecar branch
- [ ] Existing comments render correctly
- [ ] New comment persists to sidecar branch (verified with git show)
- [ ] Comment survives page reload
- [ ] Reply and resolve persist to sidecar branch
- [ ] Clean up: stop the local server

---

### Task 7: Regression Testing

Run the full automated test suites to confirm no regressions.

**Remote Playwright:**

```bash
npx playwright test --project=remote
```

These tests mock GitHub API traffic and should pass unchanged — confirms the no-ref filesystem fallback and response shapes are intact.

**Local Playwright:**

```bash
npx playwright test --project=local
```

The local tests exercise the local server flow end-to-end. They may need fixture updates to include a sidecar branch if they test comment features.

**Full unit suite:**

```bash
npx vitest run
```

**Checklist:**

- [ ] Remote Playwright: all tests pass
- [ ] Local Playwright: all tests pass (update fixtures if needed to seed sidecar branch)
- [ ] Vitest: all tests pass

**Commit:**

- [ ] Read `skill://commit`, commit any fixture updates: `test(e2e): update local fixtures for git-backed sidecars`

---

### Task 8: Final Validation

**Checks:**

- [ ] Full test suite passes: `npx vitest run`
- [ ] Type check (frontend): `npx tsc --noEmit`
- [ ] Type check (server): `npx tsc --noEmit -p server/tsconfig.json`
- [ ] Lint: `npx eslint src/ server/`
- [ ] Format: `npx prettier --check src/ server/`
- [ ] Remote Playwright: `npx playwright test --project=remote`
- [ ] Local Playwright: `npx playwright test --project=local`
- [ ] All acceptance criteria from Tasks 1-7 verified
- [ ] No dead code from the old filesystem sidecar path remains
- [ ] Build succeeds: `npm run build`
