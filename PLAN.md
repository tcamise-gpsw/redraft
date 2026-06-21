# Local Mode & AI Skills Implementation Plan

**Goal:** Add a filesystem-backed local server mode so power users and AI agents can work with proposals on disk, with live UI updates and optional git convenience.

**Architecture:** A Hono-based Node.js server (`server/`) mimics the GitHub Contents API shape, serving the same React frontend with a different base URL. File changes are pushed to the UI over WebSocket. An OMP AI skill (`/draftspace-review`) drives comment review workflows through the local server's REST API.

**Tech Stack:** Hono (HTTP server), chokidar (file watcher), ws (WebSocket), commander (CLI args), tsx (TS execution), existing React + TanStack Query frontend.

---

### Task 0: Project Scaffolding

**Files:**
- Create: `server/tsconfig.json` — Node.js-targeted TypeScript config (extends base, target ES2022, module ESNext, moduleResolution NodeNext, types: node)
- Modify: `package.json` — add dependencies (hono, chokidar, ws, commander), devDependencies (tsx, @types/ws), add `"serve"` script (`tsx server/cli.ts`), add `"bin": { "draftspace": "./bin/draftspace.mjs" }`, add `server/` to eslint and typecheck scope
- Create: `bin/draftspace.mjs` — thin shebang entry point that loads tsx and runs `server/cli.ts`
- Modify: `tsconfig.json` — add project reference to `server/tsconfig.json`
- Create: `server/` directory structure (empty files as scaffolding)

**Behavior:**
- `npm run serve -- ./proposals` should start without errors (can be a no-op server that exits cleanly)
- `npx tsc --noEmit -p server/tsconfig.json` passes
- ESLint covers `server/` in addition to `src/`

**Checklist:**
- [x] `server/tsconfig.json` compiles independently with `noEmit`
- [x] `npm run serve -- ./proposals` executes without crash (even if it does nothing useful yet)
- [x] `bin/draftspace.mjs` shebang works with `node bin/draftspace.mjs serve ./proposals`
- [x] ESLint lint command updated to cover `server/` (e.g., `eslint src/ server/`)

**Tests:**
- [x] No test file needed — scaffolding only. Run `npx tsc --noEmit -p server/tsconfig.json` to verify.

**Commit:**
- [x] `build(server): scaffold local server project structure`

---

### Task 1: Filesystem Operations Layer

**Files:**
- Create: `server/fs/operations.ts` — pure functions for file I/O and hashing
- Create: `server/fs/operations.test.ts` — unit tests
- Create: `server/types.ts` — shared server types (FileEntry, TreeEntry, etc.)

**Interface:**
```
computeBlobSha(content: Buffer): string
  — GitHub-compatible SHA: sha1("blob {size}\0{content}")

readFile(basePath: string, relativePath: string): Promise<{ content: Buffer; sha: string }>
  — Reads file, returns raw content + computed SHA. Throws if not found.

writeFile(basePath: string, relativePath: string, content: Buffer, expectedSha: string | null): Promise<{ sha: string }>
  — Writes content to disk. If expectedSha provided, verifies current file SHA matches (conflict detection). Returns new SHA.

createFile(basePath: string, relativePath: string, content: Buffer): Promise<{ sha: string }>
  — Creates a new file. Throws if file already exists.

deleteFile(basePath: string, relativePath: string, expectedSha: string): Promise<void>
  — Deletes file. Verifies SHA before deleting.

listFiles(basePath: string): Promise<TreeEntry[]>
  — Recursively lists .md and .comments.json files. Returns { path, type: "blob" } entries.
```

**Behavior:**
- `computeBlobSha` matches GitHub's algorithm exactly: `sha1("blob " + content.length + "\0" + content)`
- SHA conflict on `writeFile` throws a typed error with status 409
- `createFile` throws 422 if file exists
- Paths are always resolved relative to `basePath` — no path traversal outside the root allowed (validate `..` doesn't escape)
- All file operations use UTF-8 encoding for text content

**Checklist:**
- [x] SHA computation matches GitHub (verify with a known fixture: content "hello\n" → sha `ce013625030ba8dba906f756967f9e9ca394464a`)
- [x] Path traversal attack (`../../../etc/passwd`) is rejected
- [x] Conflict detection (SHA mismatch) returns structured 409 error
- [x] `listFiles` only returns `.md` and `.comments.json` files, ignoring other extensions

**Tests:**
- [x] Run `npx vitest run server/fs/operations.test.ts`
- [x] Test computeBlobSha against known GitHub values
- [x] Test writeFile conflict detection (stale SHA → error)
- [x] Test createFile rejects existing file
- [x] Test listFiles filters to .md and .comments.json only
- [x] Test path traversal rejection

**Commit:**
- [x] `feat(server): implement filesystem operations layer`

---

### Task 2: GitHub API Adapter Routes

**Files:**
- Create: `server/routes/user.ts` — GET /user handler
- Create: `server/routes/tree.ts` — GET /repos/:owner/:repo/git/trees/:ref handler
- Create: `server/routes/contents.ts` — GET/PUT/POST/DELETE /repos/:owner/:repo/contents/:path handler
- Create: `server/routes/commits.ts` — GET /repos/:owner/:repo/commits handler
- Create: `server/routes/index.ts` — aggregates all route groups
- Create: `server/routes/contents.test.ts` — integration tests for contents endpoints
- Create: `server/routes/tree.test.ts` — integration test for tree endpoint

**Interface:**
Each route handler receives the Hono context and the resolved `basePath` (proposals directory) via middleware or app state.

- `GET /api/github/user` → `{ login: "local-user", avatar_url: "" }` (or from config)
- `GET /api/github/repos/:owner/:repo/git/trees/:ref?recursive=1` → `{ tree: [{ path, type: "blob" }] }`
- `GET /api/github/repos/:owner/:repo/contents/:path` → `{ content: base64, sha, type: "file" }` or `{ message: "Not Found" }` with 404 when `optional` query param set
- `PUT /api/github/repos/:owner/:repo/contents/:path` → accepts `{ content: base64, sha, message }`, writes file, returns `{ content: { sha } }`
- `POST /api/github/repos/:owner/:repo/contents/:path` → same as PUT but for creation (no sha field)
- `DELETE /api/github/repos/:owner/:repo/contents/:path` → accepts `{ sha, message }`, deletes file
- `GET /api/github/repos/:owner/:repo/commits?path=:path` → `[{ commit: { message, author: { date } }, author: { login, avatar_url } }]`

**Behavior:**
- All responses include dummy rate-limit headers (`x-ratelimit-remaining: 999999`) so the frontend's rate-limit handling doesn't trigger
- The `:owner/:repo` path segments are ignored (all ops go to the configured proposals directory)
- Content encoding/decoding uses base64 to match GitHub API exactly
- The `optional` query parameter on GET contents (used by `getFileContent(path, { optional: true })`) returns 404 without throwing — the frontend handles this gracefully
- PUT validates the incoming SHA against the current file hash before writing

**Checklist:**
- [x] `GET /api/github/user` returns valid user shape
- [x] `GET .../contents/proposals/auth-overhaul.md` returns base64-encoded content + SHA
- [x] `PUT .../contents/proposals/auth-overhaul.md` with correct SHA succeeds and returns new SHA
- [x] `PUT` with stale SHA returns 409 Conflict
- [x] `GET .../git/trees/main?recursive=1` returns all proposal files
- [x] `GET .../commits?path=proposals/auth-overhaul.md` returns stat-based metadata
- [x] Rate-limit headers are present on all responses

**Tests:**
- [x] Run `npx vitest run server/routes/`
- [x] Test contents GET returns proper base64 and sha
- [x] Test contents PUT with SHA conflict returns 409
- [x] Test contents POST rejects existing file
- [x] Test tree endpoint lists only .md and .comments.json files

**Commit:**
- [x] `feat(server): implement GitHub API adapter routes`

---

### Task 3: File Watcher & WebSocket Hub

**Files:**
- Create: `server/ws/hub.ts` — WebSocket connection management and broadcast
- Create: `server/ws/hub.test.ts` — unit tests
- Create: `server/fs/watcher.ts` — chokidar watcher that emits structured events
- Create: `server/fs/watcher.test.ts` — integration tests

**Interface:**
```
// hub.ts
class WebSocketHub {
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void
  broadcast(event: FileEvent): void
  connectionCount: number
}

// watcher.ts
interface FileEvent {
  type: "file:changed" | "file:created" | "file:deleted"
  path: string       // relative path (e.g., "proposals/auth-overhaul.md")
  sha?: string       // included for "file:changed"
}

function startWatcher(basePath: string, onEvent: (event: FileEvent) => void): () => void
  — Returns a stop function. Debounces events by 100ms.
```

**Behavior:**
- File watcher monitors `basePath` recursively for `.md` and `.comments.json` files only
- Changes are debounced by 100ms (handles AI agents writing in chunks)
- The watcher computes the new SHA for changed files (using `computeBlobSha`) and includes it in the event
- WebSocket hub maintains a set of connected clients and broadcasts JSON events to all
- The hub handles connection drops gracefully (remove from set, no errors)
- On initial connection, no replay of current state is sent (the frontend uses REST to load current data)

**Checklist:**
- [x] Writing a file to disk emits `file:changed` within 200ms
- [x] Creating a new .md file emits `file:created`
- [x] Deleting a file emits `file:deleted`
- [x] Non-.md/.comments.json files are ignored
- [x] Rapid writes (10 writes in 50ms) produce at most 1-2 events (debounce works)
- [x] WebSocket broadcast delivers to all connected clients
- [x] Disconnected clients are cleaned up without errors

**Tests:**
- [x] Run `npx vitest run server/ws/ server/fs/watcher.test.ts`
- [x] Test watcher emits correct event types for add/change/unlink
- [x] Test debouncing reduces rapid events
- [x] Test hub broadcast delivers to multiple mock clients
- [x] Test hub handles client disconnect

**Commit:**
- [x] `feat(server): implement file watcher and WebSocket hub`

---

### Task 4: Git Convenience Endpoints

**Files:**
- Create: `server/routes/git.ts` — GET /api/git/status, POST /api/git/commit
- Create: `server/routes/git.test.ts` — unit tests

**Interface:**
- `GET /api/git/status` → `{ dirty: boolean, files: [{ path, status: "modified" | "untracked" | "deleted" }] }`
- `POST /api/git/commit` (body: `{ message?: string }`) → `{ sha: string, message: string }`

**Behavior:**
- `GET /api/git/status` runs `git status --porcelain` on the proposals directory, parses output, returns structured response
- `POST /api/git/commit` stages all proposal files (`git add proposals/`), commits with the provided message or auto-generates one (e.g., "Update proposals via Draftspace"), returns the commit SHA
- If the proposals directory is not inside a git repo, both endpoints return 404 with `{ message: "Not a git repository" }`
- These endpoints are convenience only — no other functionality depends on them

**Checklist:**
- [x] Status endpoint shows modified files after a write
- [x] Commit endpoint creates a real git commit with the staged changes
- [x] Non-git directory returns 404 gracefully
- [x] Auto-generated commit message includes timestamp or file list

**Tests:**
- [x] Run `npx vitest run server/routes/git.test.ts`
- [x] Test status returns dirty state after file write (using a temp git repo)
- [x] Test commit creates a commit (verify with `git log`)
- [x] Test non-git directory returns appropriate error

**Commit:**
- [x] `feat(server): add git status and commit convenience endpoints`

---

### Task 5: CLI Entry Point & Server Bootstrap

**Files:**
- Create: `server/cli.ts` — commander-based CLI with `serve` subcommand
- Create: `server/app.ts` — Hono app assembly (routes + static serving + WebSocket upgrade)
- Modify: `bin/draftspace.mjs` — finalize the entry shebang script

**Interface:**
```
CLI usage:
  draftspace serve <directory> [options]

Options:
  --port <number>   Port to listen on (default: 4200)
  --open            Auto-open browser after server starts
  --no-ui           API-only mode, skip static file serving (forward addition — implement if time allows)
  --host <string>   Bind address, default 127.0.0.1 (forward addition — implement if time allows)
```

**Behavior:**
- `server/app.ts` creates a Hono app that:
  1. Serves the pre-built React frontend from `dist/` at `/` (requires `npm run build` first; CLI checks for `dist/index.html` and prints a helpful error if missing)
  2. Mounts GitHub API adapter routes under `/api/github/`
  3. Mounts git convenience routes under `/api/git/`
  4. Handles WebSocket upgrade at `/ws`
  5. Injects `<meta name="draftspace-mode" content="local">` into the served `index.html`
- `server/cli.ts` uses commander to parse args, validates the directory exists, starts the server, starts the file watcher, and wires watcher events → WebSocket hub broadcast
- If `--open`, opens the browser using `child_process.exec('open')` / platform-appropriate command (no extra dependency)
- Graceful shutdown on SIGINT/SIGTERM: stop watcher, close WS connections, close server

**Checklist:**
- [x] `npm run serve -- ./proposals` starts server, prints URL to stdout
- [x] `curl http://localhost:4200/api/github/user` returns valid JSON
- [x] Browser can load `http://localhost:4200/` and see the React app
- [x] The served index.html contains the `draftspace-mode` meta tag
- [x] CTRL+C cleanly stops the server
- [x] Invalid directory path prints error and exits with code 1

**Tests:**
- [x] No automated tests for CLI itself (tested via E2E in Task 9)
- [x] Verify `server/app.ts` route assembly with a Hono test client (supertest-style)

**Commit:**
- [ ] `feat(server): implement CLI and server bootstrap`

---

### Task 6: Frontend Local Mode Support

**Files:**
- Create: `src/lib/mode.ts` — reads `<meta name="draftspace-mode">`, exports `isLocalMode(): boolean` and `getApiBaseUrl(): string`
- Create: `src/hooks/useFileWatcher.ts` — WebSocket hook that connects in local mode, invalidates queries
- Modify: `src/lib/github/client.ts` — accept `baseUrl` option in constructor, default to `https://api.github.com`
- Modify: `src/hooks/useAuth.ts` — in local mode, auto-authenticate with dummy credentials (bypass AuthGate)
- Modify: `src/App.tsx` — in local mode, suppress rate-limit listener
- Create: `src/hooks/__tests__/useFileWatcher.test.ts` — unit tests
- Create: `src/lib/__tests__/mode.test.ts` — unit tests for mode detection

**Interface:**
```
// mode.ts
function isLocalMode(): boolean
function getApiBaseUrl(): string  // returns `${origin}/api/github` in local mode, else "https://api.github.com"

// useFileWatcher.ts
function useFileWatcher(): void
  — In local mode: connects to ws://${window.location.host}/ws, listens for file events,
    calls queryClient.invalidateQueries() for affected paths.
  — In remote mode: no-op (returns immediately).
```

**Behavior:**
- `isLocalMode()` reads `document.querySelector('meta[name="draftspace-mode"]')?.content === 'local'`
- `getApiBaseUrl()` returns `${window.location.origin}/api/github` when `isLocalMode()` is true, otherwise `https://api.github.com`. No separate meta tag needed — the server origin IS the API base.
- `GitHubClient` constructor gains an optional `baseUrl` parameter; all fetch calls use `${baseUrl}/repos/${owner}/${repo}/...` instead of hardcoded github.com
- In local mode, `AuthProvider` auto-sets state to authenticated with `{ pat: "local", owner: "local", repo: "proposals", user: { login: "local-user", avatarUrl: "" } }` — no login screen shown
- `useFileWatcher` is called in `AppShell` (or `App`); it connects a WebSocket, parses events, and maps them to query key invalidations:
  - `file:changed` with path `proposals/x.md` → invalidate `['proposal', 'proposals/x.md', 'content']`
  - `file:changed` with path `proposals/x.comments.json` → invalidate `['proposal', 'proposals/x.md', 'comments']`
  - `file:created` / `file:deleted` → invalidate `['proposals', 'tree']`
- WebSocket auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s)
- In remote mode (no meta tag), all local-mode code paths are inert (no WebSocket opened, no auth bypass)

**Checklist:**
- [ ] In local mode, app loads without showing the PAT login screen
- [ ] `GitHubClient` uses the local server URL for API calls
- [ ] File changes on disk appear in the UI within 1 second (WebSocket → query invalidation → re-render)
- [ ] In remote mode (deployed to GitHub Pages), behavior is completely unchanged
- [ ] WebSocket disconnect + reconnect doesn't crash the app

**Tests:**
- [ ] Run `npx vitest run src/hooks/__tests__/useFileWatcher.test.ts src/lib/mode.test.ts`
- [ ] Test `isLocalMode()` with and without meta tag
- [ ] Test `useFileWatcher` invalidates correct query keys for each event type
- [ ] Test WebSocket reconnect logic

**Commit:**
- [ ] `feat(github): add local mode detection, auth bypass, and file watcher hook`

---

### Task 7: README Rewrite

**Files:**
- Modify: `README.md` — full rewrite for three personas (non-technical reviewer, technical contributor, power user / AI agent)
- Modify: `AGENTS.md` — update project intent, add server-related commands, update structure section, remove "Do not introduce a backend" pitfall

**Behavior:**
The README follows this structure (from the spec):
1. What Draftspace is (one paragraph)
2. Three modes: Remote WYSIWYG, Remote Markdown, Local + AI
3. Remote mode quick start (for reviewers and technical contributors)
4. Local mode quick start (`npm run serve -- ./proposals`)
5. Working with AI agents (skill overview)
6. Configuration (PAT, repo structure, comment format)
7. Links to detailed docs

AGENTS.md updates:
- Project intent references local server spec
- Commands section adds `npm run serve`, server typecheck, server tests
- Structure section adds `server/` directory tree
- Remove "Do not introduce a backend" pitfall (we have one now)
- Add "Keep local server logic inside `server/`" convention

**Checklist:**
- [ ] README explains all three modes clearly
- [ ] Each mode has a quick-start section with ≤5 steps
- [ ] No developer/build instructions in README (those stay in docs/development.md)
- [ ] AGENTS.md accurately reflects new commands and structure
- [ ] Links to `docs/architecture.md`, `docs/development.md`, and specs are correct

**Tests:**
- [ ] No automated tests — documentation only
- [ ] Verify all links in README resolve to existing files

**Commit:**
- [ ] `docs: rewrite README for three-persona usage and update AGENTS.md`

---

### Task 8: AI Skill — `/draftspace-review`

**Approach:** Read `skill://skill-creator` and follow its instructions to author this skill. The skill-creator skill handles file layout, trigger description, and evaluation setup.

**Files:**
- Create: `.agents/skills/draftspace-review/skill.md` — skill definition authored via skill-creator
- Create: `.agents/skills/draftspace-review/README.md` — usage documentation (if skill-creator doesn't generate one)

**Skill specification (input to skill-creator):**
- **Name:** `draftspace-review`
- **Trigger:** Use when the user wants to review, respond to, or resolve open comments across Draftspace proposals. Triggers on phrases like "review comments", "answer proposal feedback", "walk through open threads", "/draftspace-review".
- **Workflow:**
  1. Detect or start the local Draftspace server (check if port 4200 responds to `GET /api/github/user`)
  2. Read all `.comments.json` files from the proposals directory (via file I/O — `find` + `read`)
  3. Filter to unresolved threads
  4. For each unresolved thread (ordered by proposal, then document position):
     - Present: proposal name, quoted text, comment body, existing replies
     - Ask the user: "Draft a response", "Skip", or "Resolve without reply"
     - If drafting: read the full proposal for context, generate a response, write it via the local server REST API (`PUT /api/github/repos/local/proposals/contents/:path`)
     - If resolving: update the thread's `resolved` field via the same PUT endpoint
  5. After all threads are processed, optionally call `POST /api/git/commit` with a summary message
- **Interaction model (hybrid):**
  - Reads `.md` and `.comments.json` files directly from disk (file I/O)
  - Writes comment mutations via REST API (ensures SHA locking, proper JSON structure)
  - The UI updates live via file watcher → WebSocket as the agent works
- **Comment file format:** `{ version: 1, comments: CommentThread[] }` where each thread has `id`, `quote`, `quoteContext`, `author`, `body`, `createdAt`, `resolved`, `replies`

**Checklist:**
- [ ] Read `skill://skill-creator` and follow its process to create the skill
- [ ] Skill triggers on `/draftspace-review` and related phrases
- [ ] Skill finds all unresolved comments across all proposals
- [ ] Skill presents each thread with full context (quote, body, replies)
- [ ] Skill can draft and write a reply via the local server API
- [ ] Skill can resolve a thread via the local server API
- [ ] UI reflects changes in real-time as the skill works
- [ ] Run skill-creator evals if available to verify trigger accuracy

**Commit:**
- [ ] `feat(skills): add draftspace-review AI skill for comment walkthrough`

---

### Task 9: E2E Tests — Local Mode + Remote Regression

**Files:**
- Create: `e2e/local-mode.spec.ts` — Playwright tests exercising the full local mode flow with a real server
- Modify: `e2e/proposals.spec.ts` — ensure existing remote-mode tests still pass (regression gate)
- Modify: `e2e/comments.spec.ts` — ensure existing comment flow tests still pass (regression gate)
- Modify: `e2e/editing.spec.ts` — ensure existing editing tests still pass (regression gate)
- Modify: `playwright.config.ts` — add local-mode project that starts the local server as webServer for the local-mode spec

**Prerequisite:** `npm run build` must succeed before local-mode tests run (the local server serves from `dist/`). Wire this as a Playwright `globalSetup` step or a `webServer.command` that builds then serves.

**Local mode E2E scenarios (browser-driven via Playwright):**

1. **Auto-authentication**: Navigate to `http://localhost:<port>/`, verify no PAT login gate is shown, verify the user is "local-user" in the header.

2. **Proposal browsing**: Verify the tree sidebar shows all `.md` files from the fixture directory. Click a proposal, verify Milkdown renders the content (headings, text, mermaid diagrams as SVG).

3. **Editing and file writeback**: Switch to WYSIWYG or Raw mode, edit content, click Save. Verify the local file on disk was updated with the new content (read the file in the test to confirm).

4. **Comment operations**: Select text in a proposal, add a comment via the sidebar form. Verify the `.comments.json` file appears on disk with the correct structure. Add a reply, resolve the thread — verify each mutation writes back correctly.

5. **Live file watching (external change)**: While the browser has a proposal open, write to the `.md` file on disk from the test (simulating an AI agent). Verify the UI updates the content within 2 seconds (WebSocket push → query invalidation → re-render).

6. **Live tree update**: Create a new `.md` file on disk from the test. Verify it appears in the proposal tree sidebar within 2 seconds.

7. **Git convenience (if Task 4 is complete)**: After making changes, verify the commit button appears. Click it. Verify `git log` shows the new commit.

**Remote mode regression:**
- Run the existing E2E specs (`e2e/auth.spec.ts`, `e2e/proposals.spec.ts`, `e2e/comments.spec.ts`, `e2e/editing.spec.ts`) unmodified against the Vite dev server (same as before)
- These tests mock the GitHub API via Playwright route interception — they should pass exactly as before since remote mode code paths are unchanged
- If any remote-mode test fails, it indicates a regression from the local-mode frontend changes (Task 6)

**Checklist:**
- [ ] Local mode E2E: all 6-7 scenarios pass with a real local server and real filesystem
- [ ] Remote mode regression: all existing E2E specs (auth, proposals, comments, editing) pass unchanged
- [ ] File watcher → WebSocket → UI update verified with real filesystem writes
- [ ] Comment save → file writeback verified by reading the file in the test
- [ ] Server starts and stops cleanly in the test lifecycle (no port conflicts, no orphan processes)

**Tests:**
- [ ] Run `npx playwright test` (all specs: existing remote + new local)
- [ ] Verify zero regressions in remote-mode specs
- [ ] Verify all local-mode scenarios pass

**Commit:**
- [ ] `test(e2e): add local mode E2E tests and verify remote mode regression`

---

### Task 10: Final Validation

**Checks:**
- [ ] Full unit test suite passes: `npx vitest run`
- [ ] Server type check passes: `npx tsc --noEmit -p server/tsconfig.json`
- [ ] Frontend type check passes: `npx tsc --noEmit`
- [ ] Lint clean: `npx eslint src/ server/`
- [ ] Format clean: `npx prettier --check src/ server/`
- [ ] E2E passes (existing + new): `npx playwright test`
- [ ] Production build succeeds: `npm run build`
- [ ] Local server starts and serves the built frontend: `npm run serve -- ./proposals`
- [ ] Manual smoke test: open browser, navigate proposals, edit, verify file writes to disk
- [ ] README is accurate and all links resolve
- [ ] AGENTS.md reflects new commands and structure
