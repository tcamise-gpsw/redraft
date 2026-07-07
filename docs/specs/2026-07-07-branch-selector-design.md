# Branch Selector Design

**Date**: 2026-07-07
**Scope**: GitHub mode only — local mode is unaffected
**Goal**: Let users select which branch to view and edit documents on, persisted across reloads

## Context

ReDraft currently operates on the repository's default branch. The `GitHubClient.getTree()` method accepts an optional branch parameter (defaulting to `'HEAD'`), but nothing in the UI or hooks exposes branch selection. All content and tree fetches implicitly use the default branch.

## Architecture

Five change surfaces, all confined to GitHub mode:

1. **GitHubClient** — new methods + `ref` threading on reads/writes
2. **AuthContext** — branch state, persistence, default branch discovery
3. **Query keys** — branch-aware cache keys for automatic invalidation
4. **BranchSelector UI** — searchable combobox in the sidebar
5. **Navigation** — reset to tree root on branch switch

## Surface 1: GitHubClient

### New Methods

**`listBranches(): Promise<string[]>`**

Calls `octokit.repos.listBranches({ owner, repo, per_page: 100 })`. Returns branch names as strings. Paginates if needed (most repos have <100 branches). The UI determines which is the default branch by comparing against `defaultBranch` from auth context — the GitHub list-branches API does not include a default flag.

**`getDefaultBranch(): Promise<string>`**

Calls `octokit.repos.get({ owner, repo })` and returns `data.default_branch`. Called once on login or repo change to seed the branch state.

### Ref Threading on Existing Methods

| Method                                             | Change                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `getTree(branch)`                                  | Already accepts branch param — no change needed                                   |
| `getFileContent(path, options)`                    | Add optional `ref` to `GetFileOptions`. Pass to `octokit.repos.getContent()`      |
| `getLatestCommit(path, ref?)`                      | Add optional `ref` param. Pass as `sha` to `octokit.repos.listCommits()`          |
| `createFile(path, content, message, branch?)`      | Add optional `branch` param. Pass to `octokit.repos.createOrUpdateFileContents()` |
| `updateFile(path, content, sha, message, branch?)` | Add optional `branch` param. Pass to `octokit.repos.createOrUpdateFileContents()` |

All `ref`/`branch` params are optional and default to `undefined`, which makes the GitHub API use the repo's default branch — preserving existing behavior for callers that don't pass a branch.

## Surface 2: AuthContext + Persistence

### State Additions

Add to `AuthContextValue`:

```ts
branch: string | null;        // currently selected branch (null in local mode)
defaultBranch: string | null;  // repo's default branch (null in local mode)
setBranch: (name: string) => void;
```

### Lifecycle

1. **On login / repo change**: Call `client.getDefaultBranch()`. Set both `defaultBranch` and `branch` to the result. Then check localStorage for a persisted branch override.
2. **On `setBranch()`**: Update state, persist to localStorage, navigate to `/`.
3. **On page reload**: Read persisted branch from localStorage. If it exists for the current `owner/repo`, use it; otherwise fall back to the default branch discovered from the API.

### Persistence Strategy

Use a **separate localStorage key** per repo: `redraft.branch.<owner>/<repo>`.

This avoids modifying the existing `redraft.auth` blob shape, which would break stored auth for existing users. The branch key stores a plain string (the branch name).

```ts
// Read
function getStoredBranch(owner: string, repo: string): string | null {
  return localStorage.getItem(`redraft.branch.${owner}/${repo}`);
}

// Write
function setStoredBranch(owner: string, repo: string, branch: string): void {
  localStorage.setItem(`redraft.branch.${owner}/${repo}`, branch);
}
```

### Local Mode

In local mode, `branch`, `defaultBranch`, and `setBranch` are inert: `branch` stays `null`, and `setBranch` is a no-op. The `BranchSelector` component does not render. No changes to the local server.

## Surface 3: Query Key Threading

All TanStack Query keys that fetch branch-specific data include the branch value:

| Hook                    | Current key                     | New key                                 |
| ----------------------- | ------------------------------- | --------------------------------------- |
| `useDocuments`          | `['documents', 'tree']`         | `['documents', 'tree', branch]`         |
| `useDocument` (content) | `['document', path, 'content']` | `['document', path, 'content', branch]` |
| `useDocument` (commit)  | `['document', path, 'commit']`  | `['document', path, 'commit', branch]`  |
| `useComments`           | `['comments', commentsPath]`    | `['comments', commentsPath, branch]`    |
| branch list             | _(new)_                         | `['branches']`                          |

When `setBranch()` fires, the branch value in the auth context changes, which causes all branch-dependent queries to re-fetch automatically (the key changed, so TanStack Query treats them as new queries).

No manual `queryClient.invalidateQueries()` calls are needed for the branch switch itself — key-based invalidation handles it.

## Surface 4: BranchSelector Component

### File

`src/components/tree/BranchSelector.tsx`

### Placement

Renders at the top of the sidebar, directly above the "Documents" heading in `DocumentTree`. Only renders when `isLocalMode()` is `false`.

### Behavior

**Closed state**: A button showing a git-branch icon and the current branch name. Clicking opens the dropdown.

**Open state**:

- A text input for filtering branches by name (case-insensitive substring match)
- A scrollable list of branches
- The current branch is highlighted
- The default branch shows a small "(default)" badge
- Clicking a branch calls `setBranch(name)` and closes the dropdown
- Clicking outside or pressing Escape closes the dropdown
- Empty filter shows all branches

### Data Fetching

Uses a `useQuery` hook internally:

```ts
useQuery({
  queryKey: ['branches'],
  queryFn: () => client.listBranches(),
  enabled: Boolean(client) && !isLocalMode(),
  staleTime: 5 * 60 * 1000, // 5 minutes — branches don't change often
});
```

### Styling

Follows existing dark theme conventions:

- `bg-slate-900` dropdown background
- `border-slate-700` borders
- `text-slate-100` text
- `bg-slate-700` hover state on branch items
- `bg-indigo-600/20 text-indigo-300` for the currently selected branch

## Surface 5: Navigation on Branch Switch

When `setBranch()` is called:

1. Update the branch in state
2. Persist to localStorage
3. Call `navigate('/')` to return to the tree root

This avoids the complexity of checking whether the current document path exists on the new branch. The user is taken back to the document tree, which will show the new branch's files.

The `navigate('/')` call happens inside the `AuthProvider`, which wraps the router — so the provider needs access to `useNavigate()`. Since `AuthProvider` sits outside the router in the current setup, we have two options:

- **Option A**: Move the navigation call to the `BranchSelector` component (it's inside the router). `setBranch()` only updates state + persistence; the component calls `navigate('/')` after calling `setBranch()`.
- **Chosen: Option A** — keeps AuthProvider decoupled from routing.

## Error Handling

| Scenario                              | Behavior                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `listBranches()` fails (network/auth) | BranchSelector shows an error state with retry. Falls through to existing error handling in `withErrorHandling()`.      |
| `getDefaultBranch()` fails            | Auth flow shows error. Branch defaults to `null`; tree fetch falls back to HEAD (existing behavior).                    |
| Persisted branch no longer exists     | The tree/content fetch will fail with a 404. The user sees the error and can switch to another branch via the selector. |
| Rate limiting                         | Handled by existing `withErrorHandling()` — rate limit errors surface via the existing toast/event system.              |

## Testing

### Unit Tests

- `GitHubClient.listBranches()` — mock Octokit, verify correct API call and response mapping
- `GitHubClient.getDefaultBranch()` — mock Octokit, verify default branch extraction
- `GitHubClient` ref threading — verify `ref` is passed to `getContent`, `listCommits`, `createOrUpdateFileContents`
- Branch persistence — `getStoredBranch` / `setStoredBranch` round-trip
- `BranchSelector` — renders current branch, filters on input, calls `setBranch` on selection, hides in local mode
- Query key changes — verify branch is included in all document/tree query keys

### Integration

- Switching branches re-fetches the document tree with the new branch's files
- Document content reflects the selected branch
- Branch persists across page reload
- Saving a document on a non-default branch writes to the correct branch

## Files Changed

| File                                     | Change                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/github/client.ts`               | Add `listBranches()`, `getDefaultBranch()`, `ref` params                       |
| `src/hooks/useAuth.ts`                   | Add `branch`, `defaultBranch`, `setBranch` to context                          |
| `src/lib/auth/storage.ts`                | Add `getStoredBranch()`, `setStoredBranch()` helpers                           |
| `src/hooks/useDocuments.ts`              | Thread branch into query key and `getTree()` call                              |
| `src/hooks/useDocument.ts`               | Thread branch into query keys and `getFileContent()`/`getLatestCommit()` calls |
| `src/hooks/useDocumentEdit.ts`           | Thread branch into `updateFile()` call                                         |
| `src/hooks/useComments.ts`               | Thread branch into query key and file operations                               |
| `src/components/tree/BranchSelector.tsx` | **New** — searchable branch dropdown                                           |
| `src/components/tree/DocumentTree.tsx`   | Render `BranchSelector` above the tree                                         |

## Out of Scope

- Local mode branch switching (local mode uses whatever is checked out on disk)
- Branch creation or deletion from the UI
- Pull request integration
- Branch comparison / diff views
- Tag selection
