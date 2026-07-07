# Sidecar Branch Design

> Issue: [#15 — Allow Redraft Sidecar files to exist on a non-main branch](https://github.com/tcamise-gpsw/redraft/issues/15)

## Summary

Move `.redraft/comments/` sidecar files to a dedicated, configurable branch (default: `redraft`) so review metadata does not pollute the document branch. Sidecar paths are namespaced by the document's source branch to prevent collisions when reviewing the same document across multiple branches.

## Problem

Today, comment sidecar files are committed to the same branch as the documents being reviewed. This clutters `main` (or whichever branch holds the documents) with `.redraft/` metadata that most collaborators don't care about. The issue asks for sidecars to live on a separate branch.

## Design Decisions

| Decision                 | Choice                                            | Rationale                                                                              |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Default sidecar branch   | `redraft`                                         | Convention-based. Matches the issue author's suggestion.                               |
| Configurability          | Per-repo setting in Settings UI                   | Issue says "configurable if not too difficult." Stored in localStorage.                |
| Branch creation          | Manual (setup script provided)                    | No auto-create magic. App shows a clear error if the branch is missing.                |
| Sidecar path scheme      | `.redraft/comments/<sanitized-branch>/<doc-path>` | Prevents collisions across document branches.                                          |
| Branch name sanitization | `/` replaced with `--`                            | `feature/auth` becomes `feature--auth`. Simple, readable.                              |
| Local mode git commit    | Git plumbing with temp index                      | Commits sidecars to sidecar branch without checkout/stash. Atomic, safe.               |
| Document tree detection  | Parallel dual tree fetch                          | When sidecar branch differs from document branch, two `getTree` calls run in parallel. |
| Error UX                 | Toast + inline sidebar message                    | Toast on first sidecar-branch failure; comments sidebar shows inline explanation.      |

## Architecture

### Path Scheme

The `commentPath()` function changes from:

```
.redraft/comments/<doc-path>.comments.json
```

to:

```
.redraft/comments/<sanitized-doc-branch>/<doc-path>.comments.json
```

A new `sanitizeBranch(name: string): string` utility replaces `/` with `--`.

Examples:

- `docs/auth.md` reviewed on `main` → `.redraft/comments/main/docs/auth.comments.json`
- `docs/auth.md` reviewed on `feature/auth` → `.redraft/comments/feature--auth/docs/auth.comments.json`

### Affected Components

#### 1. Storage Layer (`src/lib/auth/storage.ts`)

New functions mirroring the existing branch storage pattern:

- `getStoredSidecarBranch(owner, repo): string | null` — reads `redraft.sidecarBranch.<owner>/<repo>` from localStorage
- `setStoredSidecarBranch(owner, repo, branch): void` — writes it

#### 2. Auth Context (`src/hooks/useAuth.ts`)

`AuthContextValue` gains two new fields:

- `sidecarBranch: string | null` — the active sidecar branch. Defaults to `"redraft"` in remote mode. `null` in local mode (local mode uses filesystem paths, not branch refs).
- `setSidecarBranch(name: string): void` — updates the sidecar branch and persists to localStorage.

Initialization on login:

1. Read `getStoredSidecarBranch(owner, repo)`.
2. If stored, use it. Otherwise, default to `"redraft"`.

#### 3. Comment Path Utility

Currently duplicated in `useComments.ts` and `useDocuments.ts`. Extract to a shared module (`src/lib/comments/paths.ts` or similar) with signature:

```typescript
function commentPath(docPath: string, docBranch: string): string;
function sanitizeBranch(branch: string): string;
```

#### 4. Comment Hook (`src/hooks/useComments.ts`)

Changes:

- Import `sidecarBranch` from `useAuth()` alongside `branch`.
- `commentPath()` call gains `branch` argument (the document branch, for path namespacing).
- `getFileContent` uses `ref: sidecarBranch` (was `ref: branch`).
- `createFile` / `updateFile` use `sidecarBranch` as the branch argument (was `branch`).
- Query key updates from `['document', path, 'comments', branch]` to `['document', path, 'comments', branch, sidecarBranch]`.

#### 5. Document Tree Hook (`src/hooks/useDocuments.ts`)

When `sidecarBranch !== branch`:

- Fire `getTree(branch)` and `getTree(sidecarBranch)` in parallel.
- From the document tree: extract `.md` blobs (existing behavior).
- From the sidecar tree: extract paths under `.redraft/comments/<sanitized-branch>/` matching the current document branch.
- Merge sidecar paths into the under-review logic.

When `sidecarBranch === branch`:

- Single `getTree(branch)` call. Filter sidecar paths to `.redraft/comments/<sanitized-branch>/` subdirectory (behavior change from today's unscoped prefix match, but correct).

#### 6. Settings UI (`src/routes/Settings.tsx`)

Add a "Comments branch" text input below the existing "Repository" field:

- Default value: current `sidecarBranch` (or `"redraft"` if not set).
- On save, calls `setSidecarBranch(value)`.
- Helper text: "Branch where review comments are stored. Default: redraft."

Only shown in remote mode — local mode doesn't use branch refs for sidecar storage (files live on disk, git plumbing handles the commit separately).

#### 7. Local Server — Git Commit Route (`server/routes/git.ts`)

The existing `POST /api/git/commit` route changes:

**Document commits** — The `git add` scope excludes `.redraft/`:

```
git add -- <scope> ':!.redraft/'
```

**Sidecar commits** — A new code path commits `.redraft/` files to the sidecar branch using git plumbing:

```bash
# 1. Read existing sidecar branch tree (if it exists)
GIT_INDEX_FILE=<tmpfile> git read-tree <sidecar-branch>

# 2. Stage sidecar files into the temp index
GIT_INDEX_FILE=<tmpfile> git update-index --add .redraft/comments/...

# 3. Write the new tree
tree=$(GIT_INDEX_FILE=<tmpfile> git write-tree)

# 4. Create a commit (with parent if branch exists, orphan if new)
commit=$(git commit-tree $tree -p <parent> -m "Update review comments")

# 5. Advance the branch ref
git update-ref refs/heads/<sidecar-branch> $commit
```

This never touches the working directory or the real git index. The temp index file is cleaned up after the operation.

The sidecar commit is part of the existing `/api/git/commit` route. The route detects `.redraft/` changes and routes them to the sidecar branch automatically — one "commit" action from the UI handles both document and sidecar changes transparently.

**Sidecar branch name in local mode:** The local server accepts a `--sidecar-branch` CLI flag (default: `redraft`). Set once when starting the server: `npm run serve -- --sidecar-branch redraft`. The React auth context has `sidecarBranch: null` in local mode since it doesn't need a branch ref for filesystem reads/writes — only the git commit route needs the branch name, and it gets it from the server config.

#### 8. Setup Script

A shell script at `scripts/create-sidecar-branch.sh`:

```bash
#!/usr/bin/env bash
BRANCH="${1:-redraft}"
git checkout --orphan "$BRANCH"
git rm -rf . 2>/dev/null
git commit --allow-empty -m "Initialize ReDraft sidecar branch"
git checkout -
echo "Created orphan branch '$BRANCH'. Push with: git push origin $BRANCH"
```

Creates an empty orphan branch, then switches back to the previous branch.

### Error Handling

| Scenario                                       | Behavior                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidecar branch missing (remote `getTree` 404)  | Toast: "Branch 'redraft' not found. Create it with the setup script or update the branch name in Settings." Comments sidebar shows inline message with same guidance.                                                                                                                                                                                                                                  |
| Sidecar branch missing (local git plumbing)    | Git plumbing auto-creates the branch as an orphan on first commit (`commit-tree` without `-p` creates a root commit, `update-ref` creates the ref). This is intentionally different from remote mode — local plumbing can create branches safely; the GitHub Contents API cannot create orphan branches, so remote mode requires manual setup. Toast informs user: "Created sidecar branch 'redraft'." |
| No sidecar subdirectory for current doc branch | Normal — no comments exist yet. `getFileContent` returns null, treated as empty comment state.                                                                                                                                                                                                                                                                                                         |
| Write conflict (SHA mismatch on sidecar file)  | Existing behavior preserved: "File was modified since you loaded it."                                                                                                                                                                                                                                                                                                                                  |
| `sidecarBranch === branch`                     | Single tree fetch optimization. Path scheme still includes the sanitized branch subdirectory — functionally correct, just redundant nesting.                                                                                                                                                                                                                                                           |

### Testing

#### Test Fixtures Submodule (`test-fixtures/` → `tcamise-gpsw/redraft-test-repo`)

The test-fixtures submodule must be updated as part of this work:

- **Update existing sidecar paths** — Move `.redraft/comments/api-design-v2.comments.json` to `.redraft/comments/main/api-design-v2.comments.json` (new branch-namespaced path scheme).
- **Create a `redraft` branch** — Add an orphan `redraft` branch to the test repo containing the branch-namespaced sidecar files. This exercises the remote-mode dual-tree-fetch path.
- **Add a second document branch fixture** — Optionally add sidecar files under a `feature--example` subdirectory to test multi-branch sidecar detection.
- **Update the submodule ref** — Bump the submodule pointer in the main repo after pushing changes to `redraft-test-repo`.

#### Test Matrix

| Area                         | Test Type      | What to Verify                                                                                 |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `sanitizeBranch()`           | Unit           | `main` → `main`, `feature/auth` → `feature--auth`, `a/b/c` → `a--b--c`                         |
| `commentPath(path, branch)`  | Unit           | Correct path with various branch names and doc paths                                           |
| `useComments`                | Hook test      | Reads use `sidecarBranch` ref, writes target `sidecarBranch`, query key includes both branches |
| `useDocuments` (dual fetch)  | Hook test      | Two `getTree` calls when branches differ; sidecar paths filtered to correct subdirectory       |
| `useDocuments` (same branch) | Hook test      | Single `getTree` call; under-review detection still works with new path scheme                 |
| `useAuth` sidecar state      | Hook test      | Defaults to `"redraft"`, persists to localStorage, restores on mount                           |
| Storage functions            | Unit           | `getStoredSidecarBranch` / `setStoredSidecarBranch` round-trip                                 |
| Settings UI                  | Component test | "Comments branch" input saves to auth context                                                  |
| Local git plumbing           | Integration    | Create repo, run plumbing commit, verify sidecar branch has files, working tree untouched      |
| Local commit exclusion       | Integration    | `git add` for documents skips `.redraft/`                                                      |
| Error: missing branch        | Hook test      | Toast dispatched, sidebar shows inline error, save disabled                                    |

## Files Changed

| File                               | Change                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/auth/storage.ts`          | Add `getStoredSidecarBranch`, `setStoredSidecarBranch`                     |
| `src/lib/comments/paths.ts`        | **New.** Extract and extend `commentPath()`, add `sanitizeBranch()`        |
| `src/hooks/useAuth.ts`             | Add `sidecarBranch`, `setSidecarBranch` to context                         |
| `src/hooks/useComments.ts`         | Use `sidecarBranch` for reads/writes, updated `commentPath()` call         |
| `src/hooks/useDocuments.ts`        | Dual tree fetch, filtered sidecar detection, import shared `commentPath()` |
| `src/routes/Settings.tsx`          | Add "Comments branch" input (remote mode only)                             |
| `server/routes/git.ts`             | Exclude `.redraft/` from document commit; add plumbing sidecar commit      |
| `server/cli.ts`                    | Add `--sidecar-branch` CLI flag                                            |
| `scripts/create-sidecar-branch.sh` | **New.** Orphan branch setup script                                        |
| Tests for all of the above         | Updated and new                                                            |

## Out of Scope

- Automated migration of existing sidecar files
- Sidecar branch auto-creation via GitHub API (user creates manually)
- Multi-repo sidecar support
- Local mode Settings UI for sidecar branch (uses CLI flag instead)
