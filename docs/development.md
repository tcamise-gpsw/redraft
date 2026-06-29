# Development

## Prerequisites

- Node.js 22+
- npm 10+

## Two modes, two dev loops

ReDraft has two distinct runtime modes. **Remote mode** is the original GitHub Pages product — a static SPA that reads and writes through the GitHub REST API, no server required. **Local mode** is the CLI server (`npx redraft-local`) — a Hono server that emulates the GitHub API against local files and serves the same pre-built React frontend.

Both modes share the same React source. Picking the right dev loop depends on what you are changing.

---

## Remote mode development

The SPA talks directly to `https://api.github.com`. No backend process needed.

```
Terminal 1:
  npm run dev          # Vite dev server → http://localhost:5173
```

Open `http://localhost:5173`. The PAT auth gate appears. Enter a fine-grained GitHub PAT with **Contents: Read/Write** and **Metadata: Read** on a test repository.

The Vite dev server provides HMR — edits to `src/` appear in the browser within a second without a full reload.

### Frontend changes (remote mode)

All relevant code lives in `src/`. The typical loop is:

1. Edit `src/`.
2. Vite picks up the change and hot-reloads.
3. Verify in the browser against the test repository.

### No backend process

`server/` is not involved in remote mode. The GitHub API is the only backend.

---

## Local mode development

The React frontend talks to a local Hono server that emulates the GitHub Contents API against files on disk. The Vite dev server proxies `/api` and `/ws` to that server, so you get HMR for frontend changes _and_ a live local backend at the same time.

```
Terminal 1 — backend (Hono server):
  npm run serve -- <directory> --port 5174
  # e.g. npm run serve -- test-fixtures --port 5174

Terminal 2 — frontend (Vite with proxy + local-mode meta):
  npm run dev:local    # → http://localhost:5173
```

Open `http://localhost:5173`. Local mode is active — no PAT gate, auth is bypassed automatically.

The `dev:local` script sets `VITE_LOCAL_MODE=true`, which causes Vite to:

- Inject `<meta name="redraft-mode" content="local">` into the served HTML (so `isLocalMode()` returns `true` and auth is bypassed).
- Proxy `/api/*` → `http://localhost:5174` (REST file operations).
- Proxy `/ws` → `ws://localhost:5174` (file-watcher WebSocket).

The Hono server process watches the target directory for changes and pushes `file:changed` / `file:created` / `file:deleted` events over the WebSocket. The frontend invalidates TanStack Query caches on receipt, so external edits (e.g. saving a file in your editor) appear in the browser within ~1 second.

### Frontend changes (local mode)

Same as remote mode — edit `src/`, Vite hot-reloads. The backend proxy means API calls keep working.

### Backend changes (server/)

`server/` is TypeScript compiled by `tsx` at dev time (not Vite). Changes to `server/` require restarting the Hono server process in Terminal 1:

```
# Stop Terminal 1 (Ctrl-C), then:
npm run serve -- <directory> --port 5174
```

There is no hot-reload for server code. After restarting, the Vite proxy reconnects automatically.

The server entry point is `server/cli.ts`. Key internal paths:

| Path                   | Responsibility                                      |
| ---------------------- | --------------------------------------------------- |
| `server/app.ts`        | Hono app factory, static file serving, route wiring |
| `server/fs/adapter.ts` | GitHub Contents API emulation (read/write/hash)     |
| `server/fs/watcher.ts` | chokidar wrapper, WebSocket push                    |
| `server/routes/`       | Individual Hono route handlers                      |

### Production build for local mode

`npm run build` compiles both the Vite frontend (`dist/`) and the server bundle (`dist-server/cli.mjs` via esbuild). The published `npx redraft-local` binary runs the esbuild output and serves the Vite output — no `tsx` or `node_modules` needed in a consumer install.

To test the production path locally:

```
npm run build
npm run serve -- test-fixtures --port 5174
# open http://localhost:5174
```

---

## Quick-reference: which loop to use

| What you're changing       | Command to run                                                     | URL to test             |
| -------------------------- | ------------------------------------------------------------------ | ----------------------- |
| Frontend only, remote mode | `npm run dev`                                                      | `http://localhost:5173` |
| Frontend only, local mode  | `npm run serve -- <dir>` + `npm run dev:local`                     | `http://localhost:5173` |
| Backend (`server/`)        | `npm run serve -- <dir>` (restart on change) + `npm run dev:local` | `http://localhost:5173` |
| Full production path       | `npm run build` + `npm run serve -- <dir>`                         | `http://localhost:5174` |

---

## All commands

| Command                  | What it does                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Vite dev server for remote mode (HMR, no local backend)                                             |
| `npm run dev:local`      | Vite dev server for local mode — sets `VITE_LOCAL_MODE=true`, proxies `/api` and `/ws` to port 5174 |
| `npm run serve -- [dir]` | Start the Hono local server from source via `tsx`; default port 5174                                |
| `npm run build`          | Production build: Vite frontend → `dist/`, esbuild server bundle → `dist-server/cli.mjs`            |
| `npm run build:server`   | Server bundle only (esbuild)                                                                        |
| `npm run preview`        | Preview the last Vite production build                                                              |
| `npm run test`           | Run Vitest once                                                                                     |
| `npm run typecheck`      | TypeScript check across `src/` and `server/`                                                        |
| `npm run lint`           | ESLint across `src/` and `server/`                                                                  |
| `npm run format`         | Prettier write across the repo                                                                      |
| `npm run format:check`   | Prettier check (used in CI and pre-commit)                                                          |
| `npm run e2e`            | Playwright end-to-end tests                                                                         |
| `npm run prepare`        | Wire `.githooks` for this checkout (runs automatically on `npm install`)                            |

---

## Git hooks

`npm install` runs `prepare`, which sets `core.hooksPath = .githooks`. The pre-commit hook runs `format:check` then `lint`. If either fails the commit is rejected.

To verify hooks are active:

```
git config --local --get core.hooksPath   # expected: .githooks
```

If unset (e.g. after cloning without installing), run `npm run prepare` once.

---

## Testing

- **Unit / hook tests** — Vitest (`npm run test`). Tests live alongside source in `__tests__/` subdirectories and `.test.ts` files.
- **End-to-end** — Playwright (`npm run e2e`). Tests in `e2e/`. Require a running dev server; see `playwright.config.ts` for the base URL.

Follow TDD for feature work: write the failing test first, confirm it fails, then implement.

---

## Deployment (remote mode)

GitHub Actions builds on every push to `main` and deploys `dist/` to the `gh-pages` branch. The workflow sets `VITE_BASE_PATH` to the repository name so the built app resolves assets correctly under GitHub Pages.

The local mode server (`dist-server/cli.mjs`) is published to npm as `redraft-local` via the `publish.yml` workflow, triggered manually with a `bump` input (`patch` / `minor` / `major`).
