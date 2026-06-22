# Repo-Wide Document Review

**Goal:** Remove the hardcoded `proposals/` directory assumption. ReDraft discovers and reviews any markdown file in the repository, in both local and remote modes.

---

## Core Model

- ReDraft shows **all `.md` files** in the repository (or pointed directory).
- Comment sidecars live in `.redraft/comments/<mirrored-path>.comments.json` — created on demand when the first comment is added to a document.
- The sidebar splits into **Under Review** (documents with comments) and **Documents** (everything else).
- Terminology throughout the UI changes from "Proposals" to "Documents".

---

## File Discovery

### Local Mode

Walk the filesystem from the root directory (defaults to `.`), respecting `.gitignore`:

1. Read `.gitignore` at root and nested `.gitignore` files during traversal.
2. Always exclude `.git/`, `.redraft/`, and `node_modules/` regardless of `.gitignore` content.
3. Include only `.md` files in the document tree.
4. Separately scan `.redraft/comments/` to determine which documents are "Under Review".

Uses the `ignore` npm package (runtime dependency) for `.gitignore` parsing.

### Remote Mode (GitHub)

1. Fetch the full repo tree via the GitHub Git Trees API.
2. Filter to `.md` files, excluding paths under `.redraft/`.
3. Scan `.redraft/comments/` entries in the tree to determine which documents are "Under Review".

No `.gitignore` parsing needed — GitHub's tree only contains tracked files.

---

## Comment Storage

```
.redraft/
  comments/
    README.comments.json
    docs/
      architecture.comments.json
      api-design.comments.json
```

- Path mirroring: `docs/arch.md` → `.redraft/comments/docs/arch.comments.json`
- Created on first comment save — never pre-populated.
- `.redraft/` is excluded from the document tree (it's metadata, not content).
- `.redraft/` is NOT auto-gitignored — comments are review artifacts worth version-controlling. Users can gitignore it themselves if they prefer ephemeral reviews.
- Comment file schema unchanged: `{ version: 1, comments: CommentThread[] }`

---

## Sidebar Tree UI

### Under Review (always visible)

- Flat list of documents that have a `.comments.json` in `.redraft/comments/`.
- Each entry shows the relative path (e.g. `docs/arch.md`).
- Badge showing unresolved thread count.
- Primary focus of the tool — this is where active work lives.

### Documents (collapsed by default)

- Full directory tree of all `.md` files.
- Directories shown as collapsible nodes.
- Files also present in "Under Review" get a subtle indicator (dot or icon).
- Expandable when the user needs to browse or find a file to start reviewing.

### New Document

- Button labeled "New Document".
- Dialog asks for the file path (e.g. `docs/my-new-doc.md`).
- Creates the `.md` file on disk (local) or via the Contents API (remote).
- File appears in "Documents" until someone adds a comment.

---

## API Changes

### Tree Endpoint

**Local:** `GET /api/github/repos/:owner/:repo/git/trees/:ref`

Response shape changes from a flat file list to a structured response:

```json
{
  "documents": [
    { "path": "README.md", "type": "blob" },
    { "path": "docs/architecture.md", "type": "blob" }
  ],
  "underReview": [{ "path": "docs/api-design.md", "unresolvedCount": 3 }]
}
```

**Remote:** The frontend performs the same split client-side after fetching the GitHub tree.

### Contents Endpoints

Same GitHub-compatible shape. Paths are now root-relative (no `proposals/` prefix to manage).

The local-mode URL base changes from `local/proposals` to `local/redraft` to reflect the generalized scope:

- `GET /api/github/repos/local/redraft/contents/docs/arch.md` → reads `docs/arch.md`
- `GET /api/github/repos/local/redraft/contents/.redraft/comments/docs/arch.comments.json` → reads the comment sidecar
- `PUT` / `POST` / `DELETE` unchanged in shape; paths are just root-relative now.

### Watcher (Local Only)

Emits events for:

- Any `.md` file change (respecting `.gitignore`).
- Any `.comments.json` change inside `.redraft/comments/`.

---

## CLI

```
npx redraft-local [directory]
```

- No args needed — defaults to `.` (current working directory).
- Optional `[directory]` arg for pointing at a subdirectory or non-CWD path.
- All other flags unchanged: `--port`, `--open`, `--no-ui`, `--host`.

---

## Frontend Component Changes

| Current                         | New                                           |
| ------------------------------- | --------------------------------------------- |
| `ProposalTree`                  | `DocumentTree`                                |
| `CreateProposalDialog`          | `CreateDocumentDialog`                        |
| `useProposals` hook             | `useDocuments` hook                           |
| `ProposalNode` type             | `DocumentNode` type                           |
| Header text "Proposals"         | Removed / section headers instead             |
| Tree strips `proposals/` prefix | No prefix stripping — paths are root-relative |

### Hook: `useDocuments`

- Fetches the tree (local: uses new structured response; remote: fetches GitHub tree + filters).
- Returns `{ documents, underReview, isLoading, error }`.
- Documents are `DocumentNode[]` (tree structure with path, name, type, children).
- Under review entries include `unresolvedCount`.

### Hook: `useComments`

- Reads/writes comment files from `.redraft/comments/<path>.comments.json` instead of adjacent sidecars.
- Path resolution: given document path `docs/arch.md`, comment path is `.redraft/comments/docs/arch.comments.json`.

---

## Server Changes

### `server/fs/operations.ts`

- `isTrackedProposalFile` → `isMarkdownFile` (checks `.md` extension only).
- `walkFiles` gains `.gitignore` awareness via the `ignore` package.
- New `listCommentFiles(basePath)` scans `.redraft/comments/` for existing sidecars.
- `readFile` / `writeFile` / `createFile` work unchanged — they're path-relative already.

### `server/fs/watcher.ts`

- Watches the full `basePath` for `.md` file events (filtered through `.gitignore` rules).
- Additionally watches `.redraft/comments/` for comment sidecar changes.
- `isTrackedProposalFile` → split into `isMarkdownFile` (for docs) and `isCommentFile` (for `.redraft/comments/*.comments.json`).

### `server/routes/tree.ts`

- Returns the new structured `{ documents, underReview }` response.
- Calls both `walkFiles` (for documents) and `listCommentFiles` (for review status).

### `server/routes/contents.ts`

- No structural change — already handles arbitrary paths relative to `basePath`.
- The comment file path `.redraft/comments/...` is just another valid path.

## Dependencies

| Package  | Purpose                                            | Type    |
| -------- | -------------------------------------------------- | ------- |
| `ignore` | `.gitignore` parsing for local mode file discovery | runtime |

---

## Out of Scope

- Filtering by file extension beyond `.md` (e.g. `.mdx` support) — can be added later.
- Per-file review status beyond "has comments" / "no comments" (e.g. approved/rejected states).
- Nested `.redraft/` configs or per-directory review settings.
- Changes to the comment thread schema itself.
