# ReDraft — Local Mode & AI Skills Design

Single spec covering: README restructure for three personas, filesystem-backed local server, and AI skill contracts for proposal workflows.

## Problem

ReDraft today is remote-only: a GitHub Pages static site that reads/writes proposals through the GitHub REST API. This limits its usefulness in two ways:

1. **No local workflow** — Power users and AI agents can't work with proposals on disk. Every interaction requires internet + GitHub API calls (rate-limited to 5,000/hr).
2. **No AI integration** — There's no structured way for an AI agent to review comments, draft responses, or revise proposals.
3. **README is developer-focused** — The current README explains how to build the project, not how to use it.

## Solution

A three-tier access model:

| Mode                  | User                   | Data path                     | Editing                    |
| --------------------- | ---------------------- | ----------------------------- | -------------------------- |
| **Remote (WYSIWYG)**  | Non-technical reviewer | GitHub Pages → GitHub API     | Milkdown rich-text editor  |
| **Remote (Markdown)** | Technical contributor  | GitHub Pages → GitHub API     | Raw markdown + view toggle |
| **Local**             | Power user / AI agent  | CLI server → local filesystem | Files on disk + browser UI |

All three modes share the same React frontend. The local server mimics the GitHub Contents API shape so the frontend doesn't need a separate code path for data access.

## Success Criteria

- A user can run `npx redraft serve ./proposals` and get a live browser UI showing their local proposals
- External file changes (from an editor or AI agent) appear in the UI within 1 second
- UI edits write back to local `.md` / `.comments.json` files immediately
- An OMP AI skill can review open comments and draft responses without manual API wiring
- The README explains all three modes clearly to their respective audiences

---

## README Structure

The README becomes a user-facing document. All developer/architecture content stays in `docs/`.

```
# ReDraft

One-paragraph description.

## What it does
- Collaborative proposal review
- Three modes: Remote WYSIWYG, Remote Markdown, Local + AI

## Remote Mode (GitHub Pages)
### For reviewers (WYSIWYG)
- How to access the hosted site
- How to connect (PAT setup)
- Adding comments, resolving threads

### For technical contributors (Markdown)
- Mode toggle (View / WYSIWYG / Raw)
- Editing and saving proposals
- Creating new proposals

## Local Mode
### Quick start
- `npm install && npx redraft serve ./proposals`
- Opens browser, watches for changes

### Working with AI agents
- How the AI skill connects
- Supported workflows

## Configuration
- PAT requirements (remote mode)
- Repository structure conventions
- Sidecar comment format

## Links
- docs/architecture.md — system design
- docs/development.md — building, testing, deploying
- docs/specs/ — design documents
```

---

## Local Server Architecture

### CLI Interface

```bash
# Start the local server
npx redraft serve ./proposals

# With options
npx redraft serve ./proposals --port 4200
npx redraft serve ./proposals --open    # auto-open browser
npx redraft serve ./proposals --no-ui   # API-only (for headless AI use)
```

The CLI:

1. Resolves the target directory (default: `./proposals`)
2. Starts a Hono HTTP server on the specified port (default: 4200)
3. Starts a file watcher (chokidar) on the target directory
4. Serves the pre-built React frontend at `/`
5. Exposes REST endpoints at `/api/github/...` (GitHub API shape)
6. Opens a WebSocket at `/ws` for file-change push notifications

### System Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Browser                            │
│  ┌─────────────────────────────────────────────┐    │
│  │          React Frontend (same build)        │    │
│  │  GitHubClient → baseURL: localhost:4200     │    │
│  │  WebSocket hook → /ws                       │    │
│  └──────────────────┬──────────────────────────┘    │
└─────────────────────┼───────────────────────────────┘
                      │ HTTP + WS
                      ▼
┌─────────────────────────────────────────────────────┐
│              Local Server (Hono + Node.js)           │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Static file │  │ GitHub API   │  │ WebSocket │  │
│  │ serving     │  │ adapter      │  │ hub       │  │
│  │ (React app) │  │ (REST routes)│  │ (events)  │  │
│  └─────────────┘  └──────┬───────┘  └─────┬─────┘  │
│                           │                │        │
│                    ┌──────▼────────────────▼──┐     │
│                    │   Filesystem layer        │     │
│                    │   (read/write/hash/watch) │     │
│                    └──────────┬────────────────┘     │
└───────────────────────────────┼─────────────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   Local Directory      │
                    │   proposals/           │
                    │     auth-overhaul.md   │
                    │     auth-overhaul.     │
                    │       comments.json    │
                    │     api-design-v2.md   │
                    └────────────────────────┘
```

### REST API (GitHub Contents API shape)

The local server exposes these endpoints under `/api/github/repos/:owner/:repo/`:

| Method   | Path                                 | Behavior                                                                                        |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET`    | `/user`                              | Returns a local user identity (configurable)                                                    |
| `GET`    | `/repos/:owner/:repo/git/trees/:ref` | Lists all `.md` and `.comments.json` files in the proposals directory                           |
| `GET`    | `/repos/:owner/:repo/contents/:path` | Returns `{ content (base64), sha (file hash), type: "file" }`                                   |
| `PUT`    | `/repos/:owner/:repo/contents/:path` | Decodes base64 content, verifies SHA matches current file hash, writes to disk, returns new SHA |
| `POST`   | `/repos/:owner/:repo/contents/:path` | Creates a new file (rejects if already exists)                                                  |
| `DELETE` | `/repos/:owner/:repo/contents/:path` | Deletes a file                                                                                  |
| `GET`    | `/repos/:owner/:repo/commits`        | Returns file modification metadata from `fs.stat`                                               |

**SHA generation**: The server computes SHA-1 of the file content (same algorithm GitHub uses for blob SHAs: `sha1("blob {size}\0{content}")`). This makes the optimistic locking behavior identical to remote mode.

**Content encoding**: Responses use the same base64 encoding as GitHub's Contents API. The frontend already decodes this.

### Git Integration (convenience, not a gate)

All file writes go directly to the working tree — no git involvement is required for any functionality. The server optionally exposes a convenience endpoint for committing:

| Method | Path              | Behavior                                                                       |
| ------ | ----------------- | ------------------------------------------------------------------------------ |
| `GET`  | `/api/git/status` | Returns list of modified/untracked files in the proposals directory            |
| `POST` | `/api/git/commit` | Stages all proposal changes, commits with a provided or auto-generated message |

The frontend shows a non-blocking "Commit" indicator when the working tree has uncommitted proposal changes. Clicking it commits all pending changes. This is purely a convenience — the user can always run `git add` / `git commit` manually, and no feature depends on committing through the UI.

The AI skill can also call `POST /api/git/commit` after completing a workflow (e.g., after answering all open comments), but this is optional.

### WebSocket Protocol

Connection: `ws://localhost:4200/ws`

Server → Client events (JSON):

```json
{ "type": "file:changed", "path": "proposals/auth-overhaul.md", "sha": "abc123" }
{ "type": "file:created", "path": "proposals/new-proposal.md" }
{ "type": "file:deleted", "path": "proposals/old.md" }
```

The frontend subscribes on mount and:

- `file:changed` → invalidates the TanStack Query for that path's content and comments
- `file:created` / `file:deleted` → invalidates the proposal tree query

### Frontend Changes for Local Mode

Minimal additions (all additive, no breaking changes to remote mode):

1. **Mode detection**: The local server injects `<meta name="redraft-mode" content="local">` into the served HTML. The frontend reads this at boot.

2. **Auth bypass**: In local mode, `AuthGate` auto-authenticates with a dummy PAT and the configured `owner/repo` (from server config). No login screen shown.

3. **Base URL override**: `GitHubClient` reads `VITE_API_BASE_URL` (or the meta tag) and uses it instead of `https://api.github.com`.

4. **WebSocket hook**: A new `useFileWatcher()` hook connects to `/ws` in local mode, listens for events, and calls `queryClient.invalidateQueries()` for affected paths.

5. **Rate-limit suppression**: In local mode, the rate-limit event listener is disabled (no limits on localhost).

### File Watcher

Uses `chokidar` to watch the proposals directory recursively. Debounces events by 100ms to batch rapid writes (common when an AI agent writes a file in chunks). Only emits events for `.md` and `.comments.json` files.

---

## AI Skill Design

### Interaction Model (Hybrid)

The AI agent interacts with ReDraft through two channels:

| Operation             | Channel                                      | Why                                           |
| --------------------- | -------------------------------------------- | --------------------------------------------- |
| Read proposal content | File I/O (direct disk read)                  | Natural for agents; instant; no API overhead  |
| Edit proposal content | File I/O (write to disk)                     | The file watcher picks it up and pushes to UI |
| List open comments    | REST API `GET /contents/:path.comments.json` | Gets structured data, not raw JSON parsing    |
| Add reply to thread   | REST API `PUT /contents/:path.comments.json` | Ensures proper SHA locking, ID generation     |
| Resolve thread        | REST API `PUT /contents/:path.comments.json` | Same — structured mutation                    |
| Create new proposal   | File I/O (write new .md)                     | Watcher notifies UI                           |

### Skill Surface

An OMP skill (`redraft`) with the following slash commands:

#### `/redraft-review`

**Comment review walkthrough.** The agent:

1. Scans all `.comments.json` files in the proposals directory
2. Collects unresolved threads
3. For each thread (in order of proposal, then document position):
   - Shows the quoted text, comment body, and any existing replies
   - Asks the user what to do: draft a response, skip, or resolve
   - If drafting: writes the reply via the REST API
   - UI updates live as replies are added

#### `/redraft-revise <proposal-path>`

**AI-assisted proposal revision.** The agent:

1. Reads the proposal `.md` from disk
2. Reads all comment threads for that proposal
3. Generates a revised version addressing the feedback
4. Writes the updated `.md` to disk (file watcher notifies UI)
5. Optionally resolves addressed comment threads via the API

#### `/redraft-create <topic>`

**Create a new proposal.** The agent:

1. Asks clarifying questions about the topic
2. Generates a proposal draft
3. Writes it to `proposals/<topic>.md`
4. Opens it in the UI (via a deep link or notification)

#### `/redraft-summarize`

**Summarize open discussions.** The agent:

1. Scans all proposals and their comment files
2. Produces a summary: which proposals have unresolved threads, what the key discussion points are, what's been resolved recently
3. Outputs as markdown (displayed in the agent's response)

### Skill Prerequisites

The skill requires:

- The local ReDraft server running (auto-starts if not detected)
- The proposals directory path (from skill config or cwd detection)
- Network access to `localhost:<port>` for comment API calls

---

## Implementation Scope

### MVP (this spec)

- [ ] Local server with GitHub API adapter + file watcher + WebSocket
- [ ] CLI entry point (`npx redraft serve <dir>`)
- [ ] Frontend: local mode detection, auth bypass, base URL override, WebSocket hook
- [ ] README rewrite for three personas
- [ ] AI skill: `/redraft-review` (comment walkthrough)

### Follow-up

- [ ] AI skill: `/redraft-revise`, `/redraft-create`, `/redraft-summarize`
- [ ] `--no-ui` headless mode for CI/CD or pure-API use
- [ ] Configuration file (`.redraftrc`) for port, user identity, proposal path
- [ ] npm publishing as `redraft` package
- [ ] GitHub Actions integration (auto-serve on PR for review)

---

## Technology Choices

| Component            | Choice                  | Rationale                                             |
| -------------------- | ----------------------- | ----------------------------------------------------- |
| Local server         | Hono (Node.js)          | Lightweight, TypeScript-first, fast cold start        |
| File watcher         | chokidar                | Reliable cross-platform fs watching, handles symlinks |
| WebSocket            | `ws` (via Hono upgrade) | Standard, no framework lock-in                        |
| SHA computation      | Node.js `crypto`        | Built-in, matches GitHub's blob SHA algorithm         |
| CLI argument parsing | `commander` or `yargs`  | Mature, supports subcommands                          |
| Frontend WS client   | Native `WebSocket` API  | No dependency needed                                  |

## Error Handling

| Scenario                                           | Behavior                                                       |
| -------------------------------------------------- | -------------------------------------------------------------- |
| File deleted while UI has it open                  | WebSocket `file:deleted` → UI shows "file removed" state       |
| SHA conflict (file changed between read and write) | Same 409 response as GitHub → existing conflict toast works    |
| WebSocket disconnects                              | Auto-reconnect with exponential backoff; stale indicator in UI |
| Proposals directory doesn't exist                  | CLI exits with clear error message                             |
| Port already in use                                | CLI suggests next available port                               |

## Testing Strategy

| Layer                    | Approach                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| Local server routes      | Vitest: mock filesystem, verify API shape matches GitHub             |
| File watcher → WebSocket | Integration test: write file, assert WS event received               |
| Frontend WebSocket hook  | Vitest: mock WS, verify query invalidation                           |
| AI skill                 | Manual E2E initially; structured tests once skill format stabilizes  |
| Full flow                | Playwright: start local server, navigate, verify file changes appear |
