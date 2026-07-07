# Branch Selector Implementation Plan

**Goal:** Add a searchable branch selector to the sidebar in GitHub mode, persisted across reloads, threading the selected branch through all document reads/writes.

**Architecture:** Extend `GitHubClient` with `listBranches()` and `getDefaultBranch()`, add `ref`/`branch` params to existing read/write methods. Add branch state (`branch`, `defaultBranch`, `setBranch`) to `AuthContext` with per-repo localStorage persistence. Include branch in all TanStack Query keys so cache invalidation is automatic on switch. New `BranchSelector` combobox component in the sidebar. Navigate to tree root on branch change.

**Tech Stack:** React, TypeScript, TanStack Query, Octokit, Tailwind CSS, Vitest

**Spec:** `docs/specs/2026-07-07-branch-selector-design.md`

---

### Task 1: GitHubClient — new methods and ref threading

**Files:**

- Modify: `src/lib/github/client.ts` — add new methods and optional params
- Test: `src/lib/github/__tests__/client.test.ts`

**Interface:**

New methods on `GitHubClient`:

- `listBranches(): Promise<string[]>` — calls `octokit.repos.listBranches({ owner, repo, per_page: 100 })`. If the response includes a `Link` header indicating more pages, paginate by incrementing `page` until all branches are collected. Returns `data.flatMap(page => page.map(b => b.name))`. For simplicity, use `octokit.paginate` if available, or loop with `page` param.
- `getDefaultBranch(): Promise<string>` — calls `octokit.repos.get({ owner, repo })`, returns `data.default_branch`

Modified signatures (all new params optional, default `undefined`):

- `getFileContent(path, options?)` — add `ref?: string` to the existing `GetFileOptions` interface. Pass `ref` to `octokit.repos.getContent()`.
- `getLatestCommit(path, ref?)` — add optional second param. Pass as `sha` to `octokit.repos.listCommits()`.
- `createFile(path, content, message, branch?)` — add optional fourth param. Pass `branch` to `octokit.repos.createOrUpdateFileContents()`.
- `updateFile(path, content, sha, message, branch?)` — add optional fifth param. Pass `branch` to `octokit.repos.createOrUpdateFileContents()`.

Both `listBranches()` and `getDefaultBranch()` go through the existing `withErrorHandling()` wrapper and call `updateRateLimit()`.

**Behavior:**

- When `ref`/`branch` is `undefined`, the GitHub API defaults to the repo's default branch — preserving existing behavior for all current callers.
- `listBranches()` returns names only. The UI determines which is default by comparing against `defaultBranch` from auth context.
- Error handling: all new methods use `withErrorHandling()`, so auth errors, rate limits, and network errors are classified by the existing `normalizeError()` pipeline.

**Checklist:**

- [x] `listBranches()` added, calls `octokit.repos.listBranches`, returns `string[]`
- [x] `getDefaultBranch()` added, calls `octokit.repos.get`, returns `string`
- [x] `GetFileOptions` interface extended with optional `ref`
- [x] `getFileContent` passes `ref` to Octokit when provided
- [x] `getLatestCommit` passes `ref` as `sha` to `listCommits` when provided
- [x] `createFile` passes `branch` to `createOrUpdateFileContents` when provided
- [x] `updateFile` passes `branch` to `createOrUpdateFileContents` when provided
- [x] All existing tests still pass (no breaking changes to existing callers)

**Tests:**

- [x] Run: `npx vitest run src/lib/github/__tests__/client.test.ts`
- [x] Test `listBranches()`: mock `octokit.repos.listBranches` returning `[{ name: 'main' }, { name: 'dev' }]`, verify returns `['main', 'dev']`
- [x] Test `getDefaultBranch()`: mock `octokit.repos.get` returning `{ default_branch: 'main' }`, verify returns `'main'`
- [x] Test `getFileContent` with `ref`: verify `octokit.repos.getContent` is called with `{ ref: 'dev' }` when option provided
- [x] Test `getLatestCommit` with `ref`: verify `octokit.repos.listCommits` is called with `{ sha: 'dev' }` when ref provided
- [x] Test `createFile` with `branch`: verify `createOrUpdateFileContents` receives `{ branch: 'dev' }`
- [x] Test `updateFile` with `branch`: verify `createOrUpdateFileContents` receives `{ branch: 'dev' }`

**Commit:**

- [x] Read `skill://commit`, stage relevant files, commit

---

### Task 2: AuthContext — branch state and persistence

**Files:**

- Modify: `src/lib/auth/storage.ts` — add branch persistence helpers
- Modify: `src/hooks/useAuth.ts` — add branch/defaultBranch/setBranch to context
- Test: `src/lib/auth/__tests__/storage.test.ts`

**Interface:**

New exports from `src/lib/auth/storage.ts`:

- `getStoredBranch(owner: string, repo: string): string | null` — reads `localStorage.getItem(\`redraft.branch.${owner}/${repo}\`)`
- `setStoredBranch(owner: string, repo: string, branch: string): void` — writes to the same key

New re-export from `src/lib/auth/index.ts`: add `getStoredBranch` and `setStoredBranch`.

New fields on `AuthContextValue`:

- `branch: string | null` — currently selected branch (`null` in local mode)
- `defaultBranch: string | null` — repo's default branch (`null` in local mode)
- `setBranch: (name: string) => void` — updates branch state + persists

**Behavior:**

In `AuthProvider`:

- Add `branch` and `defaultBranch` state (both `string | null`, initially `null`).
- **On initial mount / page reload** (not just `login`): when `getStoredAuth()` returns non-null auth, create a temporary `GitHubClient` and call `getDefaultBranch()` in a `useEffect`. Set `defaultBranch` to the result. Then check `getStoredBranch(owner, repo)` — if it returns a value, use that as `branch`; otherwise use the discovered default. This ensures branch state is restored on page reload, not only on explicit login.
- In the `login` callback, after successful auth, do the same branch discovery: call `client.getDefaultBranch()`, set `defaultBranch`, check `getStoredBranch(owner, repo)` for override.
- `setBranch(name)` updates the `branch` state and calls `setStoredBranch(owner, repo, name)`. It does NOT navigate — the `BranchSelector` component handles navigation (Option A from the spec).
- On `logout`, reset both `branch` and `defaultBranch` to `null`.
- On `updateRepo`, re-discover the default branch for the new repo AND check `getStoredBranch(newOwner, newRepo)` for a persisted override (the user changed repos, so the branch context must be re-initialized for the new repo).
- In local mode, `branch` and `defaultBranch` stay `null`, `setBranch` is a no-op.
- Include `branch`, `defaultBranch`, `setBranch` in the `useMemo` value and dependency array.

Edge case: `getDefaultBranch()` can fail (e.g. repo not found, network error). In that case, leave `defaultBranch` as `null` and show a toast warning ("Could not determine default branch"). Callers that pass `branch` as `null`/`undefined` to the GitHub API will get default-branch behavior (same as today). This is recoverable — the user can still use the branch selector once branches load.

**Checklist:**

- [x] `getStoredBranch` and `setStoredBranch` added to `storage.ts` and re-exported from `index.ts`
- [x] `AuthContextValue` extended with `branch`, `defaultBranch`, `setBranch`
- [x] `login` callback discovers default branch and checks localStorage
- [x] Page reload (`useEffect`) discovers default branch and restores persisted branch
- [x] `setBranch` updates state and persists
- [x] `logout` resets branch state
- [x] `updateRepo` re-discovers default branch and checks `getStoredBranch` for new repo
- [x] Local mode: `branch`/`defaultBranch` are `null`, `setBranch` is no-op
- [x] `getDefaultBranch()` failure shows toast warning and leaves `defaultBranch` as `null`

**Tests:**

- [x] Run: `npx vitest run src/lib/auth/__tests__/storage.test.ts`
- [x] Test `getStoredBranch`/`setStoredBranch` round-trip with localStorage mock
- [x] Test `getStoredBranch` returns `null` for unknown repo

**Commit:**

- [x] Read `skill://commit`, stage relevant files, commit

---

### Task 3: Query key and ref threading through hooks

**Files:**

- Modify: `src/hooks/useDocuments.ts` — thread branch into query key and `getTree()` call
- Modify: `src/hooks/useDocument.ts` — thread branch into query keys and `getFileContent()`/`getLatestCommit()` calls
- Modify: `src/hooks/useDocumentEdit.ts` — thread branch into `updateFile()` call
- Modify: `src/hooks/useComments.ts` — thread branch into query key and `getFileContent()`/`createFile()`/`updateFile()` calls
- Modify: `src/components/tree/CreateDocumentDialog.tsx` — thread branch into `createFile()` call and query invalidation key
- Test: `src/hooks/__tests__/useDocuments.test.tsx`
- Test: `src/hooks/__tests__/useDocumentEdit.test.tsx`
- Test: `src/hooks/__tests__/useComments.test.ts`

**Interface:**

All hooks that call `useAuth()` now destructure `branch` in addition to `pat`/`repo`:

```
const { pat, repo, branch } = useAuth();
```

Query key changes (actual current keys → new):

- `useDocuments`: `['documents', 'tree']` → `['documents', 'tree', branch]`
- `useDocument` content: `['document', path, 'content']` → `['document', path, 'content', branch]`
- `useDocument` commit: `['document', path, 'commit']` → `['document', path, 'commit', branch]`
- `useComments`: `['document', path, 'comments']` → `['document', path, 'comments', branch]`
- `CreateDocumentDialog` invalidation: `['documents', 'tree']` → `['documents', 'tree', branch]`
- `useDocumentEdit` invalidation: `['document', path, 'content']` → `['document', path, 'content', branch]` (and same for commit key)

**Behavior:**

`useDocuments`:

- In GitHub mode, pass `branch ?? undefined` to `client.getTree(branch)` (it already accepts a branch param).
- In local mode, `branch` is `null` — the local `fetchLocalTree` call ignores refs, so no change needed.

`useDocument`:

- Pass `{ ref: branch ?? undefined }` to `client.getFileContent(path, { ref })`.
- Pass `branch ?? undefined` to `client.getLatestCommit(path, ref)`.

`useDocumentEdit`:

- Pass `branch ?? undefined` to `client.updateFile(path, content, sha, message, branch)`.

`useComments`:

- Pass `{ optional: true, ref: branch ?? undefined }` to `client.getFileContent(commentsPath, options)`.
- Pass `branch ?? undefined` to `client.createFile()` and `client.updateFile()` in `saveComments()`.

`CreateDocumentDialog`:

- Destructure `branch` from `useAuth()`.
- Pass `branch ?? undefined` to `client.createFile()`.
- Use `['documents', 'tree', branch]` for query invalidation.

**Checklist:**

- [ ] All 5 hooks/components destructure `branch` from `useAuth()`
- [ ] All query keys include `branch` as the last element
- [ ] All `getFileContent` calls pass `ref` option
- [ ] All `getLatestCommit` calls pass `ref` param
- [ ] All `createFile`/`updateFile` calls pass `branch` param
- [ ] Query invalidation keys updated in `useDocumentEdit` and `CreateDocumentDialog`
- [ ] Local mode behavior unchanged (branch is null, API calls receive undefined)
- [ ] All existing test mocks for `useAuth` updated to include `branch: null`, `defaultBranch: null`, `setBranch: vi.fn()` (check `src/components/tree/__tests__/`, `src/components/layout/__tests__/`, `src/components/document/__tests__/`, `src/components/comments/__tests__/`)

**Tests:**

- [ ] Run: `npx vitest run src/hooks/__tests__/`
- [ ] Existing hook tests pass (update mocks to include `branch: null` in useAuth return)
- [ ] Verify query keys include branch by checking the `useQuery` call args in tests

**Commit:**

- [ ] Read `skill://commit`, stage relevant files, commit

---

### Task 4: BranchSelector UI component

**Files:**

- Create: `src/components/tree/BranchSelector.tsx` — searchable branch dropdown
- Modify: `src/components/tree/DocumentTree.tsx` — render `BranchSelector` above the tree
- Create: `src/components/tree/__tests__/BranchSelector.test.tsx`

**Interface:**

`BranchSelector` is a self-contained component with no props. It reads all data from hooks:

- `useAuth()` for `branch`, `defaultBranch`, `setBranch`, `pat`, `repo`
- `useQuery(['branches'], ...)` internally for the branch list
- `useNavigate()` for navigation on switch
- `isLocalMode()` to conditionally render

**Behavior:**

Rendering:

- The component always calls all hooks (React rules of hooks — no conditional returns before hooks). The `useQuery` call uses `enabled: Boolean(client) && !isLocalMode()` to prevent fetching when not applicable.
- After hooks, returns `null` when `isLocalMode()` is `true` or when `branch` is `null` (not authenticated yet).
- Constructs a `GitHubClient` internally via `useMemo` over `pat`/`repo` (same pattern as other hooks). `client` is `null` when unauthenticated.
- Fetches branches via `useQuery({ queryKey: ['branches'], queryFn: () => client!.listBranches(), enabled: Boolean(client) && !isLocalMode(), staleTime: 5 * 60 * 1000 })`.

Closed state:

- A button styled like existing sidebar controls (`border-slate-700`, `text-slate-100`, `rounded-md`)
- Shows a git-branch SVG icon (inline, 16×16) and the current `branch` name
- Truncates long branch names with `truncate` class (CSS text-overflow)
- Clicking opens the dropdown

Open state:

- Absolutely positioned panel below the button with `bg-slate-900 border border-slate-700 rounded-lg shadow-lg`
- Text input at the top for filtering (placeholder: "Filter branches…")
- Scrollable list (`max-h-64 overflow-y-auto`) of branch items
- Each item shows the branch name; the default branch has a `(default)` badge in `text-slate-500 text-xs`
- Currently selected branch: `bg-indigo-600/20 text-indigo-300`
- Hover: `bg-slate-700`
- Clicking a branch: calls `setBranch(name)`, calls `navigate('/')`, closes dropdown
- Close triggers: click outside (use a `useEffect` with `mousedown` listener on `document`), Escape key, selecting a branch
- Filter: case-insensitive substring match on branch name

Loading/error:

- While fetching branches: show a `Spinner` inside the dropdown
- On error: show "Failed to load branches" text with a retry button

Integration with `DocumentTree`:

- Render `<BranchSelector />` as the first child inside the `<section>` in `DocumentTree`, before the "Documents" heading `<div>`. Add a small bottom margin (`mb-3`).

**Checklist:**

- [ ] `BranchSelector.tsx` created with closed/open states
- [ ] Searchable filter input works (case-insensitive substring)
- [ ] Current branch highlighted, default branch badged
- [ ] Click-outside and Escape close the dropdown
- [ ] Selecting a branch calls `setBranch()` + `navigate('/')`
- [ ] Returns `null` in local mode
- [ ] Returns `null` when not authenticated
- [ ] Spinner shown during branch fetch
- [ ] Error state with retry shown on fetch failure
- [ ] `DocumentTree.tsx` renders `BranchSelector` above the tree

**Tests:**

- [ ] Run: `npx vitest run src/components/tree/__tests__/BranchSelector.test.tsx`
- [ ] Test: renders current branch name in closed state
- [ ] Test: opens dropdown on click, shows branch list
- [ ] Test: filter input narrows the list
- [ ] Test: clicking a branch calls `setBranch` and `navigate`
- [ ] Test: does not render in local mode (mock `isLocalMode` to return `true`)
- [ ] Test: shows spinner while loading branches
- [ ] Test: shows error state when branch fetch fails

**Commit:**

- [ ] Read `skill://commit`, stage relevant files, commit

---

### Task 5: Final Validation

**Checks:**

- [ ] Full test suite passes: `npx vitest run`
- [ ] Type check passes: `npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json`
- [ ] Lint passes: `npx eslint src/ server/`
- [ ] Format check passes: `npx prettier --check src/ server/`
- [ ] All acceptance criteria from Tasks 1–4 verified end-to-end
- [ ] No regressions: existing tests for auth, documents, comments, and document tree still pass
- [ ] Local mode unaffected: `BranchSelector` does not render, hooks pass `undefined` for branch params
