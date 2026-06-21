# Repo-Wide Document Review Implementation Plan

**Goal:** Replace the hardcoded `proposals/` directory assumption with repo-wide markdown discovery, centralized comment storage in `.redraft/comments/`, and a split sidebar tree (Under Review / Documents) — in both local and remote modes.

**Architecture:** The server walks the repo root with `.gitignore`-aware filtering (via the `ignore` npm package) to discover `.md` files, and separately scans `.redraft/comments/` for active review state. The tree API returns a structured `{ documents, underReview }` response. The frontend builds a split tree UI from this. The GitHub client's `getTree()` filter generalizes from `proposals/`-prefixed paths to all `.md` files. Comment path resolution changes from adjacent sidecars to `.redraft/comments/<mirrored-path>.comments.json`.

**Tech Stack:** `ignore` (gitignore parsing), Hono (server), React + TanStack Query (frontend), Vitest (tests).

**Spec:** `docs/specs/2026-06-21-repo-wide-document-review-design.md`

---
### Task 1: Server — Gitignore-Aware File Discovery & Comment Scanning

**Files:**
- Modify: `package.json` — add `ignore` as a runtime dependency
- Modify: `server/fs/operations.ts` — rewrite `walkFiles` with gitignore filtering, add `listCommentFiles`
- Modify: `server/types.ts` — add `ReviewEntry` type to `TreeEntry`
- Test: `server/fs/operations.test.ts`

**Interface:**

```ts
// server/types.ts — additions
export interface ReviewEntry {
  path: string;          // document path (e.g. "docs/arch.md")
  unresolvedCount: number;
}

// server/fs/operations.ts — new/changed exports
export async function walkMarkdownFiles(basePath: string): Promise<TreeEntry[]>
export async function listReviewEntries(basePath: string): Promise<ReviewEntry[]>
```

**Behavior:**

`walkMarkdownFiles(basePath)`:
- Recursively walks `basePath`, collecting `.md` files only.
- Reads `.gitignore` at root and nested `.gitignore` files encountered during traversal; filters paths through the `ignore` instance.
- Always excludes `.git/`, `.redraft/`, and `node_modules/` directories regardless of `.gitignore` content.
- Returns paths relative to `basePath`.

`listReviewEntries(basePath)`:
- Scans `.redraft/comments/` under `basePath` for `*.comments.json` files.
- For each sidecar found, reads it, parses the JSON, counts threads where `resolved !== true`.
- Returns a `ReviewEntry` per sidecar with the corresponding document path (reverse the mirroring: `.redraft/comments/docs/arch.comments.json` → `docs/arch.md`).
- If `.redraft/comments/` doesn't exist, returns an empty array (no error).

The existing `readFile`, `writeFile`, `createFile`, `deleteFile` functions are unchanged — they already accept arbitrary relative paths.

Remove the old `isTrackedProposalFile` function (no longer needed by this module — the watcher handles its own filter).

**Checklist:**
- [ ] `ignore` package installed and importable
- [ ] `walkMarkdownFiles` returns only `.md` files
- [ ] `.git/`, `.redraft/`, `node_modules/` are always excluded even without a `.gitignore`
- [ ] Nested `.gitignore` files are respected (e.g. `docs/.gitignore` with `drafts/`)
- [ ] `listReviewEntries` returns correct `unresolvedCount` per document
- [ ] `listReviewEntries` returns `[]` when `.redraft/comments/` doesn't exist
- [ ] Path mirroring is correct: sidecar `a/b.comments.json` → document `a/b.md`

**Tests:**
- [ ] Run `npx vitest run server/fs/operations.test.ts`
- [ ] Test: walks a temp directory with mixed files, returns only `.md`
- [ ] Test: respects a `.gitignore` that excludes a subdirectory
- [ ] Test: hardcoded exclusions work without any `.gitignore` present
- [ ] Test: `listReviewEntries` counts unresolved threads correctly
- [ ] Test: `listReviewEntries` handles missing `.redraft/comments/` gracefully

**Commit:**
- [ ] Read `skill://conventional-commit`, stage relevant untracked files, commit with `git commit -m` in Conventional Commits format

---

### Task 2: Server — API Generalization & Watcher Update

**Files:**
- Modify: `server/routes/index.ts` — remove `proposals/` prefix in `toLocalPath`/`toApiPath`, change to identity pass-through
- Modify: `server/routes/tree.ts` — return `{ documents, underReview }` structured response
- Modify: `server/fs/watcher.ts` — replace `isTrackedProposalFile` with split filters for `.md` and `.redraft/comments/`
- Modify: `server/cli.ts` — change default directory from `'./proposals'` to `'.'`, update help text, run serve without args
- Test: `server/routes/tree.test.ts`, `server/fs/watcher.test.ts`, `server/app.test.ts`

**Interface:**

```ts
// Tree route response shape
interface TreeResponse {
  documents: { path: string; type: 'blob' }[];
  underReview: { path: string; unresolvedCount: number }[];
}

// Watcher — unchanged export signature, but filter logic changes
export function startWatcher(
  basePath: string,
  onEvent: (event: FileEvent) => void,
): () => void
```

**Behavior:**

`server/routes/index.ts`:
- `toLocalPath(apiPath)` becomes the identity function — just returns `apiPath` unchanged. Remove the `proposals/` prefix guard and stripping.
- `toApiPath(localPath)` becomes the identity function — returns `localPath` unchanged. Remove `proposals/` prepending.
- This means API content paths are now root-relative: the frontend sends `docs/arch.md` and the server reads `<basePath>/docs/arch.md`.

`server/routes/tree.ts`:
- Calls `walkMarkdownFiles(basePath)` for `documents`.
- Calls `listReviewEntries(basePath)` for `underReview`.
- Returns the `TreeResponse` JSON.

`server/fs/watcher.ts`:
- Replace `isTrackedProposalFile` with two checks:
  - `isWatchedMarkdownFile(path)`: returns `true` if path ends with `.md` and does NOT start with `.redraft/`. Also apply gitignore filtering (load the `ignore` instance at watcher start time).
  - `isCommentFile(path)`: returns `true` if path starts with `.redraft/comments/` and ends with `.comments.json`.
- Both types of changes emit the existing `FileEvent` shape (the frontend uses the path to decide what to invalidate).

`server/cli.ts`:
- Change default from `'./proposals'` to `'.'`.
- When no directory arg is provided, default to serving CWD (don't show help — just start).
- Update command description/help text to say "directory to serve" instead of "proposal directory".

**Checklist:**
- [ ] `toLocalPath` / `toApiPath` are identity (no `proposals/` prefix logic)
- [ ] Tree endpoint returns `{ documents: [...], underReview: [...] }`
- [ ] Watcher emits events for `.md` changes and `.redraft/comments/` changes
- [ ] Watcher ignores `.git/`, `node_modules/`, and gitignored paths
- [ ] CLI defaults to `.` when no arg given and starts the server (no help screen)
- [ ] Existing `contents` routes still work — they just receive root-relative paths now

**Tests:**
- [ ] Run `npx vitest run server/`
- [ ] Update `server/routes/tree.test.ts` for new response shape
- [ ] Update `server/fs/watcher.test.ts` to verify the split filter logic
- [ ] Update `server/app.test.ts` if it references `proposals/` paths
- [ ] Update `server/routes/contents.test.ts` to use root-relative paths (no `proposals/` prefix)

**Commit:**
- [ ] Read `skill://conventional-commit`, stage relevant untracked files, commit with `git commit -m` in Conventional Commits format

---

### Task 3: Frontend — Data Layer (Types, Hooks, GitHub Client)

**Files:**
- Modify: `src/types/proposals.ts` — rename to `src/types/documents.ts`, update type name
- Modify: `src/types/github.ts` — no change needed (TreeItem is generic enough)
- Create: `src/hooks/useDocuments.ts` — replaces `useProposals.ts`
- Modify: `src/hooks/useComments.ts` — change comment path resolution
- Modify: `src/hooks/useAuth.ts` — change `LOCAL_AUTH.repo` from `'proposals'` to `'redraft'`
- Modify: `src/hooks/useFileWatcher.ts` — update query keys and comment path derivation
- Modify: `src/hooks/useProposal.ts` — rename to `src/hooks/useDocument.ts` for consistency
- Modify: `src/lib/github/client.ts` — generalize `getTree()` filter
- Delete: `src/hooks/useProposals.ts`
- Delete: `src/types/proposals.ts`
- Test: `src/hooks/__tests__/useComments.test.ts`, `src/hooks/__tests__/useFileWatcher.test.ts`, `src/lib/github/__tests__/client.test.ts`

**Interface:**

```ts
// src/types/documents.ts
export interface DocumentNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DocumentNode[];
}

export interface ReviewEntry {
  path: string;
  unresolvedCount: number;
}

// src/hooks/useDocuments.ts
export function useDocuments(): {
  documents: DocumentNode[];
  underReview: ReviewEntry[];
  isLoading: boolean;
  error: Error | null;
}
```

**Behavior:**

`src/types/documents.ts`:
- Same shape as current `ProposalNode` but renamed to `DocumentNode`.
- Add `ReviewEntry` interface for the "Under Review" list.

`src/hooks/useDocuments.ts`:
- In **local mode**: fetches the tree endpoint which now returns `{ documents, underReview }`. Builds the tree from `documents` (no `proposals/` prefix stripping — paths are already root-relative). Passes `underReview` through directly.
- In **remote mode**: fetches the GitHub tree via `client.getTree()`, filters to `.md` files excluding `.redraft/` paths, builds the tree. For `underReview`: scan the tree response for paths matching `.redraft/comments/*.comments.json` — each match implies a document is under review. Set `unresolvedCount: 0` (counts not available without reading each file; acceptable for POC — the presence in "Under Review" is the key signal).
- Query key: `['documents', 'tree']`.

`src/hooks/useComments.ts`:
- Change `commentPath(path)` from `path.replace(/\.md$/, '.comments.json')` to `.redraft/comments/${path.replace(/\.md$/, '.comments.json')}`.
  - Example: `docs/arch.md` → `.redraft/comments/docs/arch.comments.json`
- Everything else stays the same — the hook reads/writes via the GitHub client which talks to the API endpoint.

`src/hooks/useFileWatcher.ts`:
- Change tree invalidation query key from `['proposals', 'tree']` to `['documents', 'tree']`.
- Update comment path derivation: when a `.comments.json` change arrives, the path is now `.redraft/comments/docs/arch.comments.json`. Strip the `.redraft/comments/` prefix, then replace `.comments.json` with `.md` to get the document path for cache invalidation.
- Add handling for `file:created`/`file:deleted` events in `.redraft/comments/` — these should invalidate the tree (since "Under Review" status changes).

`src/hooks/useProposal.ts` → `src/hooks/useDocument.ts`:
- Rename for consistency. Query keys `['proposal', path, 'content']` and `['proposal', path, 'commit']` change to `['document', path, 'content']` and `['document', path, 'commit']`.
- Update all consumers that import `useProposal`.

`src/lib/github/client.ts` — `getTree()`:
- Remove the `item.path.startsWith('proposals/')` filter.
- Keep only `.md` files (type `blob`, path ends with `.md`).
- Exclude paths starting with `.redraft/`.
- Return paths as-is (root-relative).

**Checklist:**
- [ ] `DocumentNode` and `ReviewEntry` types exported from `src/types/documents.ts`
- [ ] `useDocuments` returns `{ documents, underReview, isLoading, error }`
- [ ] `useComments` resolves comment path to `.redraft/comments/...`
- [ ] `useFileWatcher` invalidates `['documents', 'tree']` for create/delete events
- [ ] `useFileWatcher` strips `.redraft/comments/` prefix when deriving document path from comment events
- [ ] `getTree()` returns all `.md` files, not just `proposals/`-prefixed ones
- [ ] `getTree()` excludes `.redraft/` paths
- [ ] `useProposal` renamed to `useDocument`, query keys updated
- [ ] Old `src/hooks/useProposals.ts` and `src/types/proposals.ts` deleted
- [ ] All imports updated (no dangling references to deleted files)
- [ ] `LOCAL_AUTH.repo` changed to `'redraft'` in `src/hooks/useAuth.ts`

**Tests:**
- [ ] Run `npx vitest run src/`
- [ ] Update `src/hooks/__tests__/useComments.test.ts` — verify the new comment path resolution
- [ ] Update `src/hooks/__tests__/useFileWatcher.test.ts` — verify new query keys and path derivation
- [ ] Verify `getTree` filter logic via `src/lib/github/__tests__/client.test.ts`

**Commit:**
- [ ] Read `skill://conventional-commit`, stage relevant untracked files, commit with `git commit -m` in Conventional Commits format

---

### Task 4: Frontend — UI Components & Routing

**Files:**
- Create: `src/components/tree/DocumentTree.tsx` — replaces `ProposalTree.tsx`
- Create: `src/components/tree/CreateDocumentDialog.tsx` — replaces `CreateProposalDialog.tsx`
- Modify: `src/components/tree/TreeNode.tsx` — update type import, route path generation
- Delete: `src/components/tree/ProposalTree.tsx`
- Delete: `src/components/tree/CreateProposalDialog.tsx`
- Modify: `src/hooks/useProposalEdit.ts` — rename to `src/hooks/useDocumentEdit.ts`, fix navigation path and query keys
- Modify: `src/routes/ProposalView.tsx` — rename to `src/routes/DocumentView.tsx`, fix path resolution
- Modify: `src/routes/Home.tsx` — use `DocumentTree`, update welcome text
- Modify: `src/App.tsx` — update route path from `/proposals/*` to `/d/*`, update imports
- Test: `src/components/tree/__tests__/ProposalTree.test.tsx` → rename and update

**Interface:**

```ts
// DocumentTree — replaces ProposalTree
export function DocumentTree(): JSX.Element
// Props: none (uses useDocuments hook internally)
// Renders two sections: "Under Review" and "Documents"

// CreateDocumentDialog — replaces CreateProposalDialog
export function CreateDocumentDialog(props: {
  open: boolean;
  onClose: () => void;
}): JSX.Element
```

**Behavior:**

`DocumentTree`:
- Calls `useDocuments()` to get `{ documents, underReview, isLoading, error }`.
- Renders two collapsible sections:
  1. **"Under Review"** — always expanded. Shows a flat list of `underReview` entries. Each shows the document path and an unresolved count badge. Clicking navigates to the document route.
  2. **"Documents"** — collapsed by default (user can expand). Renders `documents` as the existing recursive `TreeNode` tree. Files that appear in `underReview` get a subtle dot indicator.
- "New Document" button opens `CreateDocumentDialog`.
- Loading/error states same pattern as current `ProposalTree`.

`CreateDocumentDialog`:
- Single input field for the file path (e.g. `docs/my-doc.md`).
- Auto-appends `.md` if not present.
- Does NOT prepend `proposals/` — uses the path as-is.
- On create: calls `client.createFile(path, content)` with a minimal template.
- On success: invalidates `['documents', 'tree']` query, navigates to the new doc route.

`TreeNode`:
- Update `ProposalNode` import → `DocumentNode`.
- Route path changes from `/proposals/${node.path.replace(/^proposals\//, '')}` to `/d/${node.path}`.
- Accept an optional `hasComments?: boolean` prop to render the indicator dot.

`src/hooks/useDocumentEdit.ts` (was `useProposalEdit.ts`):
- Navigation: change from `navigate(`/${path.replace(...)}`)` to `navigate(`/d/${path}`)`.
- Query keys: `['proposal', path, 'content']` → `['document', path, 'content']`, `['proposal', path, 'commit']` → `['document', path, 'commit']`.
- Toast/commit message text: "Proposal saved" → "Document saved", "Update proposal:" → "Update:".

`src/routes/DocumentView.tsx` (was `ProposalView.tsx`):
- Remove `proposals/` prefix prepending: path from URL params is used directly.
  - Old: `proposals/${cleaned}` 
  - New: `cleaned` (the path is already root-relative, e.g. `docs/arch.md`)
- Use `DocumentTree` in sidebar instead of `ProposalTree`.
- Use `useDocument` instead of `useProposal`.
- Use `useDocumentEdit` instead of `useProposalEdit`.

`src/App.tsx`:
- Route changes: `/proposals/*` → `/d/*` (short, avoids collision with actual paths).
- Update component import names.

`src/routes/Home.tsx`:
- Replace `ProposalTree` with `DocumentTree`.
- Update welcome text from "proposal" language to "document" language.

**Checklist:**
- [ ] "Under Review" section always visible, shows documents with unresolved counts
- [ ] "Documents" section collapsed by default, expandable
- [ ] Clicking a document in either section navigates correctly
- [ ] "New Document" creates a file at the specified root-relative path
- [ ] Route `/d/docs/arch.md` correctly resolves to document path `docs/arch.md`
- [ ] `useDocumentEdit` navigates to `/d/${path}` after save
- [ ] No references to `ProposalTree`, `CreateProposalDialog`, `ProposalNode`, `useProposal`, or `useProposalEdit` remain
- [ ] All `proposals/`-prefixed route logic removed

**Tests:**
- [ ] Run `npx vitest run src/`
- [ ] Rename and update `src/components/tree/__tests__/ProposalTree.test.tsx` → `DocumentTree.test.tsx`
- [ ] Test: Under Review section renders entries from `underReview` data
- [ ] Test: Documents section is collapsed by default
- [ ] Test: New Document dialog validates and creates with correct path

**Commit:**
- [ ] Read `skill://conventional-commit`, stage relevant untracked files, commit with `git commit -m` in Conventional Commits format

---

### Task 5: E2E Testing & Final Validation

**Files:**
- Modify: `e2e/local-mode.spec.ts` — update for new paths, `.redraft/comments/` storage, `/d/` routes
- Modify: `e2e/proposals.spec.ts` — rename to `e2e/documents.spec.ts`, update mocked tree/paths for remote mode
- Modify: `e2e/comments.spec.ts` — update route paths and comment sidecar expectations
- Modify: `e2e/editing.spec.ts` — update route paths
- Modify: `playwright.config.ts` — update local project fixture setup if it references `proposals/`

**Behavior:**

Read `skill://e2e-browser-testing` before starting this task.

**Local mode E2E** (`npx playwright test --project=local`):
- Update `LOCAL_PROPOSALS_ROOT` or equivalent fixture path to reflect that the server now points at a repo root (not a `proposals/` subdirectory).
- Update the fixture seeding: place `.md` files at various paths (not just top-level), and seed `.redraft/comments/` with at least one sidecar.
- Test the split tree: "Under Review" section shows documents with comment sidecars, "Documents" section shows the full tree.
- Test document browsing: navigate via `/d/<path>`, confirm content renders.
- Test editing and file writeback: switch to Raw, edit, save, verify file on disk at the correct root-relative path.
- Test comment creation: add a comment, save, verify `.redraft/comments/<path>.comments.json` created on disk.
- Test live file watching: create a new `.md` file on disk, verify it appears in the Documents tree.
- Test live comment sidecar watching: create a `.redraft/comments/` file on disk, verify the document moves to "Under Review".

**Remote mode E2E** (`npx playwright test --project=remote`):
- Update mocked GitHub tree responses to return `.md` files at various paths (not `proposals/`-prefixed).
- Include `.redraft/comments/` entries in the mocked tree to verify "Under Review" detection.
- Update mocked content responses to use root-relative paths.
- Verify the split tree renders correctly with mocked data.
- Verify document navigation uses `/d/<path>` routes.
- Verify comment read/write targets `.redraft/comments/` paths.

**Static checks:**
- [ ] Full unit test suite passes: `npx vitest run`
- [ ] Type check passes: `npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json`
- [ ] Lint passes: `npx eslint src/ server/`
- [ ] Format check passes: `npx prettier --check src/ server/`
- [ ] Build succeeds: `npm run build`

**E2E checks:**
- [ ] `npx playwright test --project=local` passes — all local mode scenarios green
- [ ] `npx playwright test --project=remote` passes — all remote mode scenarios green
- [ ] Local: tree shows "Under Review" with seeded comment sidecar
- [ ] Local: creating a comment writes to `.redraft/comments/` on disk (not adjacent)
- [ ] Local: editing and saving writes to the correct root-relative path
- [ ] Local: file watcher updates both tree sections live
- [ ] Remote: split tree renders from mocked tree data
- [ ] Remote: comment operations target `.redraft/comments/` paths

**Documentation updates:**
- [ ] Update `AGENTS.md` — change "proposals" references to "documents", update command examples (e.g. `npm run serve -- ./proposals` → `npm run serve`), update directory descriptions if any reference `proposals/` as the primary content path
- [ ] Update `README.md` — update quick-start instructions (`npx redraft-local` with no required args), update architecture description, change any "proposal" language to "document"
- [ ] Update `docs/development.md` — update local server commands and workflow descriptions
- [ ] Update `.agents/skills/redraft-review/SKILL.md` — change comment sidecar paths from adjacent to `.redraft/comments/`, update API paths from `local/proposals` to `local/redraft`
- [ ] Update `.agents/skills/e2e-browser-testing/SKILL.md` — update route paths, fixture paths, and scenario descriptions from `proposals/` to repo-root model

**Final sweep:**
- [ ] No remaining references to `proposals/` in source code (sample data in `proposals/` directory can stay or be removed)
- [ ] All acceptance criteria from spec verified end-to-end
- [ ] `npx prettier --write src/ server/ e2e/` to normalize formatting

**Commit:**
- [ ] Read `skill://conventional-commit`, stage relevant untracked files, commit with `git commit -m` in Conventional Commits format
