# Development

## Modes

**Remote mode** is the published GitHub Pages product. The React SPA talks directly to `https://api.github.com` using a fine-grained PAT stored in localStorage. No local server needed.

**Local mode** is the `npx redraft-local` CLI. A Hono server emulates the GitHub Contents API against files on disk and serves the same frontend with the local-mode meta tag injected. Used for local document workflows and AI agents.

Both modes share the same `src/` codebase. `server/` is local mode only.

Test fixtures are in `test-fixtures/` — a git submodule pointing to `tcamise-gpsw/redraft-test-repo`. Commits there must be made and pushed from inside that directory.

---

## Dev loops

| Goal                       | Run                                                            | URL                                                 |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Frontend, remote mode      | `npm run dev`                                                  | `localhost:5173` (Vite default)                     |
| Frontend, local mode       | `npm run serve -- <dir> --port 5174` **+** `npm run dev:local` | `localhost:5173` (Vite, proxied local mode)         |
| Backend (`server/`) change | edit → restart `npm run serve -- <dir> --port 5174`            | `localhost:5173` via Vite / `localhost:5174` direct |
| Production path end-to-end | `npm run build` + `npm run serve -- <dir>`                     | `localhost:4200`                                    |

`dev:local` keeps the UI on Vite's default `5173`, proxies `/api` and `/ws` to the Hono server on `5174`, and injects the local-mode meta tag. Standalone `npm run serve` defaults to `4200`; `server/` has no hot reload, so restart the Hono process after backend changes.

---

## I want to work on...

| I want to change...                        | Start                                                              | Edit here                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Auth, PAT flow, login gate                 | `npm run dev`                                                      | `src/components/auth/`, `src/hooks/useAuth.ts`, `src/lib/auth/`                        |
| Document rendering / WYSIWYG editor        | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `src/components/document/`, `src/hooks/useDocument.ts`, `src/hooks/useDocumentEdit.ts` |
| Milkdown / ProseMirror plugins             | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `src/components/document/milkdown/`                                                    |
| Comment threads, sidebar, replies          | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `src/components/comments/`, `src/hooks/useComments.ts`                                 |
| Comment anchor resolution / fuzzy match    | `npm run test`                                                     | `src/lib/comments/anchoring.ts`                                                        |
| Text selection → new comment capture       | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `src/components/document/milkdown/selectionCapture.ts`                                 |
| Document tree (left sidebar)               | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `src/components/tree/`, `src/hooks/useDocuments.ts`                                    |
| App shell, header, layout                  | either                                                             | `src/components/layout/`, `src/routes/`                                                |
| GitHub API client (remote mode data layer) | `npm run dev`                                                      | `src/lib/github/client.ts`                                                             |
| Mode detection (local vs remote)           | —                                                                  | `src/lib/mode.ts`, `vite.config.ts`                                                    |
| Shared UI primitives                       | either                                                             | `src/components/ui/`                                                                   |
| Server routes — file CRUD, tree listing    | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `server/routes/`                                                                       |
| Filesystem operations, SHA generation      | `npm run test`                                                     | `server/fs/operations.ts`                                                              |
| File watcher + WebSocket push              | `npm run serve -- test-fixtures --port 5174` + `npm run dev:local` | `server/fs/watcher.ts`, `server/ws/hub.ts`                                             |
| CLI flags, server startup                  | —                                                                  | `server/cli.ts`, `server/app.ts`                                                       |
| Build, proxy config, Vite plugins          | —                                                                  | `vite.config.ts`                                                                       |
| CI pipelines / npm publish workflow        | —                                                                  | `.github/workflows/`                                                                   |

---

## Tests

Tests live next to source in `__tests__/` subdirectories or `.test.ts` siblings.

| Test file                                                    | Covers                                            |
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

---

## Commands

```
npm run dev                        # remote mode (HMR on 5173, no local server)
npm run dev:local                  # local mode UI (HMR on 5173, proxies /api + /ws to 5174)
npm run serve -- <dir>             # Hono server + static frontend on 4200 by default
npm run serve -- <dir> --port 5174 # pair the Hono server with `npm run dev:local`
npm run build                      # production build: dist/ + dist-server/cli.mjs
npm run build:server     # server bundle only (esbuild)
npm run test             # Vitest unit tests
npm run typecheck        # tsc across src/ and server/
npm run lint             # ESLint
npm run format           # Prettier write
npm run format:check     # Prettier check (CI + pre-commit)
npm run e2e              # Playwright
```
