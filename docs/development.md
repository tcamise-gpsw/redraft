# Development

## Dev loops

| Goal                  | Run                                                            | URL                          |
| --------------------- | -------------------------------------------------------------- | ---------------------------- |
| Frontend, remote mode | `npm run dev`                                                  | `localhost:5173`             |
| Frontend, local mode  | `npm run serve -- <dir> --port 5174` **+** `npm run dev:local` | `localhost:5173`             |
| Backend change        | edit `server/` → restart `npm run serve`                       | `localhost:5173` (via proxy) |
| Production path       | `npm run build` + `npm run serve -- <dir>`                     | `localhost:5174`             |

`dev:local` sets `VITE_LOCAL_MODE=true` → Vite injects the local-mode meta tag and proxies `/api` and `/ws` to the Hono server on port 5174. No PAT gate. Backend changes need a manual server restart — no HMR for `server/`.

Test fixtures live in `test-fixtures/` (git submodule → `tcamise-gpsw/redraft-test-repo`). Changes there must be committed and pushed from inside that directory.

---

## Frontend map (`src/`)

### Authentication

| File                               | What lives here                                            |
| ---------------------------------- | ---------------------------------------------------------- |
| `src/components/auth/AuthGate.tsx` | Wraps the app; bypassed in local mode                      |
| `src/components/auth/AuthForm.tsx` | PAT + repo input form (remote mode only)                   |
| `src/hooks/useAuth.ts`             | Auth state, login/logout, `LOCAL_AUTH` stub for local mode |
| `src/lib/auth/storage.ts`          | `localStorage` key, `StoredAuth` shape                     |
| `src/lib/mode.ts`                  | `isLocalMode()` (reads meta tag), `getApiBaseUrl()`        |

### Document tree (left sidebar)

| File                                           | What lives here                                   |
| ---------------------------------------------- | ------------------------------------------------- |
| `src/components/tree/DocumentTree.tsx`         | Sidebar shell, under-review list, expand/collapse |
| `src/components/tree/TreeNode.tsx`             | Recursive file/folder node                        |
| `src/components/tree/CreateDocumentDialog.tsx` | New document dialog                               |
| `src/hooks/useDocuments.ts`                    | Fetches the tree; derives `underReview` list      |

### Document viewer/editor (center panel)

| File                                                   | What lives here                                                |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `src/routes/ProposalView.tsx`                          | Route — wires tree, document, comments together                |
| `src/components/document/DocumentView.tsx`             | Loads content, shows spinner/error, owns save                  |
| `src/components/document/MilkdownDocument.tsx`         | View/WYSIWYG/Raw tab switcher, mode state                      |
| `src/components/document/milkdown/CrepeEditor.tsx`     | Milkdown Crepe wrapper, comment highlight plugin wiring        |
| `src/components/document/milkdown/selectionCapture.ts` | Captures ProseMirror text selections, snaps to word boundaries |
| `src/components/document/milkdown/commentPlugin.ts`    | ProseMirror decoration plugin — highlights anchored text       |
| `src/components/document/RawEditor.tsx`                | Plain textarea fallback                                        |
| `src/components/document/ActivityIndicator.tsx`        | "Last edited by" bar                                           |
| `src/hooks/useDocument.ts`                             | Fetches raw file content + commit info                         |
| `src/hooks/useDocumentEdit.ts`                         | Wraps save — base64 encode, SHA check, PUT                     |

### Comments (right sidebar)

| File                                           | What lives here                                          |
| ---------------------------------------------- | -------------------------------------------------------- |
| `src/components/comments/CommentsSidebar.tsx`  | Ordered threads + orphan section + pending form          |
| `src/components/comments/CommentThread.tsx`    | Single thread card — quote, body, replies, resolve/reply |
| `src/components/comments/CommentBody.tsx`      | Author chip + timestamp + body text                      |
| `src/components/comments/CommentForm.tsx`      | New comment input (appears after text selection)         |
| `src/components/comments/ReplyForm.tsx`        | Reply textarea                                           |
| `src/components/comments/OrphanedComments.tsx` | Threads whose anchor no longer resolves                  |
| `src/hooks/useComments.ts`                     | Loads, caches, and mutates comment threads; owns save    |
| `src/lib/comments/anchoring.ts`                | `resolveAnchor`, `createAnchor`, fuzzy match logic       |

### Layout / shell

| File                                  | What lives here                                     |
| ------------------------------------- | --------------------------------------------------- |
| `src/components/layout/AppLayout.tsx` | Three-panel responsive grid, mobile toggles         |
| `src/components/layout/Header.tsx`    | Logo, avatar, rate-limit display, Settings link     |
| `src/routes/Home.tsx`                 | Welcome screen (no document selected)               |
| `src/routes/Settings.tsx`             | PAT/repo settings (remote) or local-mode info panel |
| `src/hooks/useFileWatcher.ts`         | WebSocket → `queryClient.invalidateQueries` bridge  |
| `src/hooks/useToast.ts`               | Toast queue                                         |

### Shared primitives

| File                            | What lives here                      |
| ------------------------------- | ------------------------------------ |
| `src/components/ui/Avatar.tsx`  | Renders `<img>` or initials fallback |
| `src/components/ui/Button.tsx`  | Primary/secondary button             |
| `src/components/ui/Dialog.tsx`  | Modal wrapper                        |
| `src/components/ui/Spinner.tsx` | Loading indicator                    |
| `src/components/ui/Toast.tsx`   | Toast notification                   |

### GitHub API client

| File                       | What lives here                                                   |
| -------------------------- | ----------------------------------------------------------------- |
| `src/lib/github/client.ts` | All GitHub REST calls; emits `auth-error` and `rate-limit` events |
| `src/lib/github/errors.ts` | `AuthError`, `RateLimitError`, `NetworkError`, `ConflictError`    |
| `src/lib/github/index.ts`  | Re-exports                                                        |

### Types

| File                     | What lives here                           |
| ------------------------ | ----------------------------------------- |
| `src/types/comments.ts`  | `CommentThread`, `CommentReply`, `Author` |
| `src/types/documents.ts` | `DocumentNode` (tree node)                |
| `src/types/github.ts`    | `User`, `RateLimitInfo`                   |

---

## Backend map (`server/`)

### Entry points

| File              | What lives here                                                     |
| ----------------- | ------------------------------------------------------------------- |
| `server/cli.ts`   | Commander CLI — parses args, starts watcher + server                |
| `server/app.ts`   | Hono app factory (`buildReDraftApp`), static serving, `/api/health` |
| `server/types.ts` | Shared server-side types                                            |

### GitHub API emulation

| File                        | What lives here                                                      |
| --------------------------- | -------------------------------------------------------------------- |
| `server/routes/index.ts`    | Mounts all route modules under `/api/github`                         |
| `server/routes/user.ts`     | `GET /user` → local identity                                         |
| `server/routes/tree.ts`     | `GET /repos/:o/:r/git/trees/:ref` → `.md` + `.comments.json` listing |
| `server/routes/contents.ts` | `GET/PUT/POST/DELETE /repos/:o/:r/contents/:path` → file CRUD        |
| `server/routes/commits.ts`  | `GET /repos/:o/:r/commits` → file mtime metadata                     |
| `server/routes/git.ts`      | `GET /api/git/status`, `POST /api/git/commit` → convenience git ops  |
| `server/fs/operations.ts`   | Low-level read/write/hash (git blob SHA-1)                           |

### File watching / WebSocket

| File                   | What lives here                                                |
| ---------------------- | -------------------------------------------------------------- |
| `server/fs/watcher.ts` | chokidar → debounced `file:changed/created/deleted` events     |
| `server/ws/hub.ts`     | WebSocket broadcast hub — clients subscribe, watcher publishes |

---

## Tests

Unit and hook tests sit next to source in `__tests__/` subdirectories or `.test.ts` siblings. Key test files:

| Test file                                                    | What it covers                                    |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `src/lib/comments/__tests__/anchoring.test.ts`               | Anchor resolve, fuzzy match, context match        |
| `src/components/document/milkdown/selectionCapture.test.ts`  | Word-boundary snap                                |
| `src/components/layout/__tests__/Header.test.tsx`            | Rate-limit display, avatar                        |
| `src/components/tree/__tests__/DocumentTree.test.tsx`        | Tree expand/collapse, under-review, create dialog |
| `src/components/comments/__tests__/CommentsSidebar.test.tsx` | Thread ordering, orphan detection                 |
| `server/fs/operations.test.ts`                               | SHA generation, read/write round-trip             |
| `server/routes/contents.test.ts`                             | PUT SHA conflict, POST creates, GET decodes       |
| `server/ws/hub.test.ts`                                      | Broadcast, subscribe/unsubscribe                  |
| `e2e/`                                                       | Playwright — full browser flows                   |

Run unit tests: `npm run test`. Run E2E: `npm run e2e` (requires a dev server).

---

## Config and build

| File                            | What lives here                                                          |
| ------------------------------- | ------------------------------------------------------------------------ |
| `vite.config.ts`                | Vite build + test config; `local-mode-meta` plugin; `/api` + `/ws` proxy |
| `server/tsconfig.json`          | TypeScript config for `server/`                                          |
| `tailwind.config.js`            | Tailwind theme                                                           |
| `eslint.config.js`              | ESLint rules                                                             |
| `.prettierignore`               | Excluded from format checks                                              |
| `.githooks/pre-commit`          | Runs `format:check` + `lint` before every commit                         |
| `.github/workflows/ci.yml`      | Test + lint on push                                                      |
| `.github/workflows/publish.yml` | Manual npm publish (`bump: patch/minor/major`)                           |

---

## Commands

```
npm run dev              # remote mode frontend (HMR)
npm run dev:local        # local mode frontend (HMR + proxy to port 5174)
npm run serve -- <dir>   # local Hono server from source (restart on server changes)
npm run build            # full production build (dist/ + dist-server/)
npm run build:server     # server bundle only
npm run test             # Vitest unit tests
npm run typecheck        # tsc across src/ and server/
npm run lint             # ESLint
npm run format           # Prettier write
npm run format:check     # Prettier check (CI + pre-commit)
npm run e2e              # Playwright
```
