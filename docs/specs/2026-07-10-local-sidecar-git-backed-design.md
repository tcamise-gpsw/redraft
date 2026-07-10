# Local Mode: Git-Backed Sidecar Branch

**Date:** 2026-07-10
**Status:** Draft

## Problem

Local mode and remote mode use different storage backends for comments:

- **Remote mode** reads/writes comment sidecars from the `redraft` Git branch via the GitHub API, passing `?ref=redraft` on reads and `branch: "redraft"` in the PUT body on writes.
- **Local mode** reads/writes comment sidecars from the local filesystem under `.redraft/comments/` in the working tree.

This means comments created in remote mode are invisible in local mode, and vice versa. The "Under Review" list is empty locally even when documents have active review threads on the sidecar branch.

This defeats the purpose of local mode, which exists to let power users and AI agents participate in the **same** review workflow using local tooling — not a siloed parallel system.

## Solution

Make the local server respect the `ref` and `branch` parameters it already receives from the frontend. When a request targets a Git branch (e.g., `?ref=redraft`), route through Git plumbing instead of the filesystem.

The frontend already sends these parameters correctly — the local server just ignores them today.

## Architecture

### Routing rule

The discriminator is the **branch parameter**, not the path prefix:

| Request                                             | Branch param present?   | Storage backend                                        |
| --------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| `GET /contents/:path`                               | No `?ref`               | Filesystem (documents)                                 |
| `GET /contents/:path?ref=redraft`                   | Yes                     | Git (`git show redraft:<path>`)                        |
| `PUT /contents/:path` (no `branch` in body)         | No                      | Filesystem (documents)                                 |
| `PUT /contents/:path` (`branch: "redraft"` in body) | Yes                     | Git plumbing (commit to sidecar branch)                |
| `POST /contents/:path`                              | Same logic              | Same logic                                             |
| `DELETE /contents/:path`                            | Same logic              | Same logic                                             |
| `GET /git/trees/HEAD?sidecarBranch=redraft`         | Sidecar via query param | Documents from filesystem, sidecars from `git ls-tree` |

Document reads/writes (`.md` files on the working tree) are completely unchanged.

### Data flow

```
Frontend (useComments)
  │
  ├── Read: GET /contents/.redraft/comments/main/foo.comments.json?ref=redraft
  │         └── Local server → git show redraft:.redraft/comments/main/foo.comments.json
  │
  ├── Write: PUT /contents/.redraft/comments/main/foo.comments.json
  │          body: { content, sha, branch: "redraft" }
  │          └── Local server → git plumbing → commit to refs/heads/redraft
  │
  └── Tree: GET /git/trees/HEAD?recursive=1&sidecarBranch=redraft
            └── Local server → walk filesystem for .md files
                             → git ls-tree redraft for sidecars
                             → parse each for unresolved count
```

## Server Changes

### 1. New module: `server/fs/git-sidecar.ts`

Git plumbing operations for reading and writing files on a named branch without checking it out. Reuses the exact temp-index pattern from `commitSidecars` in `server/routes/git.ts`.

**Functions:**

#### `readGitFile(repoRoot, branch, path) → { content: Buffer, sha: string }`

- `git show <branch>:<path>` with `encoding: 'buffer'` for content
- `computeBlobSha(content)` for the SHA
- Throws `FileOperationError(404)` if the branch or path doesn't exist

#### `writeGitFile(repoRoot, branch, path, content, expectedSha, message) → { sha: string }`

Conflict-checked write:

1. Get current blob SHA via `git rev-parse <branch>:<path>` (404 if not found → throw `FileOperationError(404)`)
2. If `expectedSha` doesn't match → throw `FileOperationError(409)` (conflict)
3. Write content to a temp file
4. `git hash-object -w <temp-file>` → new blob SHA
5. Create temp index, `git read-tree <branch>` into it
6. `git update-index --add --cacheinfo 100644,<sha>,<path>`
7. `git write-tree`
8. `git commit-tree <tree> -p <parent> -m <message>` with ReDraft committer identity
9. `git update-ref refs/heads/<branch> <commit>`
10. Clean up temp files
11. Return `{ sha: newBlobSha }`

#### `createGitFile(repoRoot, branch, path, content, message) → { sha: string }`

Same plumbing as `writeGitFile` but:

- No SHA check (file doesn't exist yet)
- If the file already happens to exist, it overwrites (matching `POST` then falling through to `PUT` behavior on the GitHub API)

#### `deleteGitFile(repoRoot, branch, path, expectedSha) → void`

1. Verify current SHA matches `expectedSha`
2. Create temp index, read-tree, `git update-index --force-remove <path>`
3. Write tree, commit, update ref

#### `listSidecarEntries(repoRoot, sidecarBranch, docBranch) → ReviewEntry[]`

1. `git ls-tree -r --name-only <sidecarBranch>` → all file paths on the branch
2. Filter to paths matching `.redraft/comments/<sanitizedDocBranch>/*.comments.json`
3. For each match, `git show <sidecarBranch>:<path>` → parse JSON → count threads where `resolved !== true`
4. Map to `{ path: <docPath>, unresolvedCount }` (derive doc path by stripping the sidecar prefix and changing extension)
5. If the sidecar branch doesn't exist, return `[]`

### 2. Contents route: `server/routes/contents.ts`

Add `branch?: string` to `ContentRequestBody`.

Add a branch check at the top of each handler:

- **GET**: if `c.req.query('ref')` is set → call `readGitFile` instead of `readFile`
- **PUT**: if `body.branch` is set → call `writeGitFile` or `createGitFile` (same create-on-404 fallback logic that exists today) instead of filesystem write
- **POST**: if `body.branch` is set → call `createGitFile`
- **DELETE**: if `body.branch` is set → call `deleteGitFile`

Filesystem path (no ref/branch) is completely unchanged.

### 3. Tree route: `server/routes/tree.ts`

Accept `sidecarBranch` as a query parameter:

```
GET /api/github/repos/:owner/:repo/git/trees/:ref?recursive=1&sidecarBranch=redraft
```

Replace the `listReviewEntries(basePath, branch)` call (which walks the filesystem) with `listSidecarEntries(basePath, sidecarBranch, branch)` (which reads from Git).

If `sidecarBranch` is absent, fall back to the server-configured default (`helpers.sidecarBranch`).

### 4. Helpers update: `server/routes/index.ts`

Add `sidecarBranch` to `ContentsRouteHelpers` so the contents route has access to the configured default sidecar branch name (used for error messages). No functional change to routing — the branch is always determined by the request params.

## Frontend Changes

Minimal — the frontend already sends `ref` and `branch` correctly.

### 1. `fetchLocalTree` in `src/hooks/useDocuments.ts`

Add `sidecarBranch` parameter. Append `&sidecarBranch=<value>` to the tree endpoint URL.

### 2. `useDocuments`

Pass `sidecarBranch` from `useAuth()` to `fetchLocalTree()`.

### 3. No other frontend changes

`useComments` already sends `ref: sidecarBranch` on reads and `branch: sidecarBranch` on writes via `GitHubClient`. `GitHubClient` already passes these to the API. No changes needed.

## Removed Code

`walkCommentFiles` and `listReviewEntries` in `server/fs/operations.ts` become dead code after this change (they walk the filesystem for sidecar files). Remove them and their associated `walkCommentFiles` helper function.

The `COMMENTS_ROOT` constant in `operations.ts` is also no longer needed on the server side (it remains in the frontend's `src/lib/comments/paths.ts` for constructing sidecar paths).

## Testing

### Unit tests: `server/fs/git-sidecar.test.ts`

Create a temp directory with `git init`, seed an orphan `redraft` branch with test sidecar files (same pattern used in `git.test.ts` and `tree.test.ts`):

- **readGitFile**: reads content and SHA correctly; throws 404 for missing branch; throws 404 for missing path
- **writeGitFile**: writes content, returns new SHA, persists to branch (verified with `git show`); throws 409 on SHA mismatch
- **createGitFile**: creates new file on branch, returns SHA; handles nested directory paths in the tree
- **deleteGitFile**: removes file from branch; throws 404 for missing file
- **listSidecarEntries**: finds `.comments.json` files, returns correct unresolved counts; returns `[]` for non-existent branch; filters to the correct document branch prefix

### Route tests: update `server/routes/contents.test.ts` and `tree.test.ts`

Extend existing test suites:

- **contents.test.ts**: add cases where `?ref=<branch>` and `body.branch` route through Git. Verify filesystem operations still work when no ref/branch is present.
- **tree.test.ts**: add cases where `?sidecarBranch=redraft` returns underReview from the Git sidecar branch. Verify documents still come from the filesystem.

These route tests need a seeded Git repo (like `tree.test.ts` already uses).

### E2E: browser-driven local mode test

Using the e2e-browser-testing skill:

1. Start `npm run serve` against a repo with a `redraft` sidecar branch seeded with at least one existing comment sidecar
2. Open the browser, verify "Under Review" shows the document with existing comments
3. Open the document, verify the existing comments render in the sidebar
4. Add a new comment, save, verify it persists to the sidecar branch (check with `git show redraft:<path>` on the command line)
5. Reload the page, verify the comment is still there

### Regression: remote Playwright suite

Run the full remote Playwright project to confirm the contents route changes don't break remote mode:

```bash
npx playwright test --project=remote
```

The remote tests mock API traffic and never hit the local Git path, so they should pass unchanged — but running them confirms we didn't break the no-ref filesystem fallback or response shapes.

### Regression: local Playwright suite

Run the local Playwright project:

```bash
npx playwright test --project=local
```

The local tests exercise the local server flow end-to-end. They need a working sidecar branch in their fixture setup to exercise the new Git-backed path.

## Edge Cases

| Scenario                             | Behavior                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidecar branch doesn't exist         | `readGitFile` → 404. `listSidecarEntries` → empty `[]`. Tree returns empty `underReview`. Frontend shows "Branch not found" toast (existing behavior). |
| Directory isn't a Git repo           | All git commands fail → 500. Same as existing git route behavior.                                                                                      |
| SHA mismatch on save                 | `writeGitFile` → 409 Conflict. Frontend shows "File was modified" error (existing behavior).                                                           |
| First comment on a document          | `createGitFile` handles new paths — Git trees are implicit from paths, no need to pre-create directories.                                              |
| User pushes sidecar branch to remote | Local Git branch stays as-is. User must `git fetch` + update local sidecar branch to see remote changes. This matches normal Git workflow.             |
| Concurrent local saves               | SHA conflict detection handles this — second save sees a different SHA and gets a 409.                                                                 |

## Non-goals

- Auto-fetching/syncing the sidecar branch from the remote on server startup — future enhancement
- Supporting non-Git directories for sidecar storage — out of scope; local mode assumes a Git repo
- Migrating existing filesystem-based `.redraft/comments/` to the sidecar branch — manual one-time migration if needed
