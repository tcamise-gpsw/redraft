# ReDraft — Core Design

This spec covers the full MVP: proposal browsing, markdown viewing, inline comments, document editing, GitHub sync, and project scaffolding.

## Problem

Engineering teams lack a good workflow for collaboratively developing technical proposals before they are mature enough for source control documentation. Proposals live in scattered Google Docs, Notion pages, or Slack threads with no structured review process.

## Solution

A static React application hosted on GitHub Pages that reads and writes proposal files (markdown + comment sidecar JSON) in a GitHub repository via the GitHub REST API. No backend infrastructure.

## Success Criteria

A small engineering team can create, review, discuss, and evolve technical proposals entirely through a GitHub Pages site backed by a GitHub repository, without any dedicated backend.

## Non-Goals

- Realtime collaboration (beyond activity indicators)
- Notifications
- User management / access control beyond GitHub PAT
- AI assistants
- Google Docs-style text suggestions

---

## Architecture

```
┌────────────────────────────┐
│     GitHub Pages           │
│  (static hosting)          │
│                            │
│  ┌──────────────────────┐  │
│  │   React SPA          │  │
│  │  (Vite + TS + TW)    │  │
│  └──────────┬───────────┘  │
└─────────────┼──────────────┘
              │ GitHub REST API
              │ (PAT in localStorage)
              ▼
┌────────────────────────────┐
│     GitHub Repository      │
│                            │
│  proposals/                │
│    camera-session.md       │
│    camera-session.         │
│      comments.json         │
│    media-pipeline/         │
│      overview.md           │
│      overview.             │
│        comments.json       │
└────────────────────────────┘
```

**Key properties:**
- Single repository holds both the React app source and the `proposals/` directory
- GitHub Pages serves the built React app from a `gh-pages` branch, deployed via GitHub Actions
- All data access goes through the GitHub REST API using a fine-grained PAT
- The PAT identifies the user — no separate identity system

### Tech Stack

| Layer | Choice |
|-------|--------|
| Build | Vite |
| UI | React 19, TypeScript |
| Styling | Tailwind CSS |
| Routing | React Router (hash-based for GitHub Pages SPA compatibility) |
| Data fetching | TanStack Query |
| Markdown | Milkdown Crepe (`@milkdown/crepe`, `@milkdown/react`, `@milkdown/kit`) |
| GitHub API | Octokit REST client (@octokit/rest) |

### Routing

Hash-based routing is required because GitHub Pages doesn't support SPA fallback routing. All routes are `/#/...`:

| Route | View |
|-------|------|
| `/#/` | Proposal tree (root) |
| `/#/proposals/:path` | View and edit a specific proposal |
| `/#/settings` | PAT and repository configuration |

---

## Authentication

### Flow

1. User visits the GitHub Pages URL
2. App checks `localStorage` for an existing PAT
3. If no PAT: **AuthGate** component renders a form requesting a fine-grained GitHub PAT
4. User creates a PAT on GitHub with scopes:
   - `Contents: Read/Write` (read/write proposal files)
   - `Metadata: Read` (repo metadata, user info)
5. User pastes PAT into the form
6. App validates the PAT by calling `GET /user` — confirms it works and retrieves the authenticated user's login and avatar
7. PAT and user info are stored in `localStorage`
8. App renders the main layout

### PAT Management

- A **Settings** page allows clearing the stored PAT (logout)
- The app shows the authenticated user's GitHub avatar and login in the header
- If a PAT becomes invalid (401 response), the app clears it and returns to the AuthGate

### Security Considerations

- The PAT is stored in `localStorage` — acceptable for an internal team tool, but documented as a known limitation
- The PAT never leaves the browser (no backend to leak it to)
- The repo should be private to prevent unauthenticated access to proposal content


### Repository Configuration

The app needs to know which GitHub repository contains the proposals. This is configured on the **Settings** page:

- **Repository** — `owner/repo` string (e.g., `myteam/proposals`)
- Stored in `localStorage` alongside the PAT
- The AuthGate prompts for both PAT and repository on first visit
- Can be changed later via Settings

---

## Repository Structure

```
proposals/
├── camera-session.md
├── camera-session.comments.json
├── media-pipeline/
│   ├── overview.md
│   └── overview.comments.json
└── api-design/
    ├── rest-conventions.md
    └── rest-conventions.comments.json
```

### Conventions

- Proposals are `.md` files under `proposals/`
- Subdirectories group related proposals
- Each proposal `foo.md` has a sidecar comment file `foo.comments.json`
- The comment file is created on first comment (not pre-populated)
- The proposal tree in the UI mirrors this directory structure

---

## Data Model

### Comment File Schema (`*.comments.json`)

```typescript
interface CommentFile {
  /** Schema version for forward compatibility */
  version: 1;
  /** All comment threads for this document */
  comments: CommentThread[];
}

interface CommentThread {
  /** Unique ID (nanoid) */
  id: string;
  /** The selected text this comment anchors to */
  quote: string;
  /** Surrounding text for anchor relocation when the document changes */
  quoteContext: {
    /** Text immediately before the quote (up to 100 chars) */
    prefix: string;
    /** Text immediately after the quote (up to 100 chars) */
    suffix: string;
  };
  /** GitHub user who created the thread */
  author: {
    login: string;
    avatarUrl: string;
  };
  /** The comment body (plain text, may contain markdown) */
  body: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** Whether the thread has been resolved */
  resolved: boolean;
  /** Replies to this thread (one level deep, no nesting) */
  replies: CommentReply[];
}

interface CommentReply {
  /** Unique ID (nanoid) */
  id: string;
  /** GitHub user who wrote the reply */
  author: {
    login: string;
    avatarUrl: string;
  };
  /** The reply body */
  body: string;
  /** ISO 8601 timestamp */
  createdAt: string;
}
```

### Anchor Reconciliation

When a document is edited, quoted text may move or change. The app uses a multi-step strategy to relocate comment anchors:

1. **Exact match** — search for the exact `quote` string in the document. If found, anchor is valid.
2. **Context match** — if exact match fails, search for `prefix + quote + suffix` pattern with fuzzy matching. Handles minor edits around the anchor.
3. **Fuzzy match** — if context match fails, use longest-common-substring matching against the quote to find the best candidate location. Accept if similarity is above 70%.
4. **Orphaned** — if all matching fails, the comment is marked as "orphaned." Orphaned comments appear in a separate section at the bottom of the comments sidebar with a warning indicator. They are never deleted automatically.

---

## Component Architecture

```
App
├── AuthGate                  — PAT input, validation, wraps everything
│   └── AuthForm              — PAT paste form with validation feedback
├── AppLayout                 — Three-panel responsive shell
│   ├── ProposalTree          — Left sidebar
│   │   ├── TreeNode          — Recursive file/folder node
│   │   └── CreateProposalBtn — New proposal action
│   ├── DocumentView          — Center panel
│   │   ├── ActivityIndicator — Latest commit summary
│   │   └── MilkdownDocument  — View / WYSIWYG / Raw document surface
│   │       ├── CrepeEditor   — Milkdown-backed renderer/editor
│   │       ├── RawEditor     — Plain textarea fallback
│   │       └── milkdown/     — ProseMirror plugins and node views
│   └── CommentsSidebar       — Right panel
│       ├── CommentThread     — One thread with replies
│       │   ├── CommentBody   — Single comment display
│       │   └── ReplyForm     — Reply input
│       ├── CommentForm       — New comment input (triggered by text selection)
│       └── OrphanedComments  — Unanchored comments section
└── Settings                  — PAT management page
```

### Non-UI Modules

| Module | Responsibility |
|--------|---------------|
| `lib/github/` | GitHub API client: auth validation, file CRUD, tree listing, commits, user info. Wraps @octokit/rest. |
| `lib/comments/` | Comment anchoring: create anchors from text selection, resolve anchors to document positions, fuzzy matching, orphan detection. |

---

## User Flows

### Viewing a Proposal

1. User selects a proposal from the **ProposalTree**
2. App navigates to `/#/proposals/:path`
3. TanStack Query fetches the `.md` file content and `.comments.json` (if it exists) from GitHub API
4. **MilkdownDocument** renders the proposal in read-only mode with comment highlights
5. **CommentsSidebar** shows all comment threads, ordered by their position in the document
6. Clicking a comment in the sidebar scrolls to and highlights the anchored text
7. Clicking a highlight in the document scrolls to the corresponding comment in the sidebar

### Adding a Comment

1. User selects text in the document surface
2. A small **"Comment" popover** appears near the selection
3. User clicks the popover → **CommentForm** opens in the sidebar, pre-filled with the selected text as the anchor quote
4. User types their comment and clicks **Submit**
5. App constructs the `CommentThread` object with:
   - The selected text as `quote`
   - Surrounding text extracted from the document as `quoteContext`
   - Authenticated user's info as `author`
6. App reads the current `.comments.json` from GitHub (or creates a new one), appends the new thread, and commits the updated file
7. TanStack Query cache is invalidated, re-fetching the comments
8. The new comment appears in the sidebar with a corresponding highlight in the document

### Editing a Proposal

1. User opens a proposal at `/#/proposals/:path`
2. User switches between **View**, **WYSIWYG**, and **Raw** tabs inside **MilkdownDocument**
3. WYSIWYG edits happen in Milkdown; raw edits happen in a textarea fallback
4. User clicks **Save**
5. App commits the updated `.md` file to GitHub via the Contents API
6. The proposal view re-renders the saved content without leaving the route

### Creating a Proposal

1. User clicks **"New Proposal"** in the sidebar
2. A dialog prompts for:
   - File path (relative to `proposals/`, e.g. `api-design/graphql-schema.md`)
   - Title (used as the initial `# heading` in the file)
3. App creates the new `.md` file via the GitHub Contents API with initial content:
   ```markdown
   # {title}

   <!-- Write your proposal here -->
   ```
4. App navigates to the new proposal's view

### Concurrency

The app uses a two-layer approach to handle concurrent edits:

**Activity indicator:** Each proposal view shows a "last edited by @login at timestamp" line, derived from the most recent commit touching that file (fetched via `GET /repos/:owner/:repo/commits?path=:path&per_page=1`). This gives users visibility into who else is working on a proposal without any locking infrastructure.

**SHA-based optimistic locking:** Before every commit (edit or comment), the app:

1. Fetches the latest file SHA from the GitHub API
2. Compares it to the SHA from when the file was last loaded
3. If SHAs match → commit proceeds normally
4. If SHAs differ → the file was modified externally. The app shows an error banner: **"This file was modified since you loaded it. Please refresh and re-apply your changes."**
5. No auto-merge. The user must refresh, which re-fetches the latest content, and then re-apply their changes.

---

## GitHub API Usage

### Endpoints Used

| Operation | Endpoint | Method |
|-----------|----------|--------|
| Validate PAT | `GET /user` | GET |
| List proposal tree | `GET /repos/:owner/:repo/git/trees/:branch?recursive=1` | GET |
| Read file | `GET /repos/:owner/:repo/contents/:path` | GET |
| Create file | `PUT /repos/:owner/:repo/contents/:path` | PUT |
| Update file | `PUT /repos/:owner/:repo/contents/:path` (with SHA) | PUT |

### Rate Limiting

- GitHub API allows 5,000 requests/hour for authenticated users
- For a small team reviewing proposals, this is far more than sufficient
- The app displays remaining rate limit info in the header (from `x-ratelimit-remaining` response header)
- TanStack Query's caching reduces redundant requests

### Commit Messages

Auto-generated, descriptive:
- `"Create proposal: camera-session.md"`
- `"Update proposal: camera-session.md"`
- `"Add comment on camera-session.md"`
- `"Reply to comment on camera-session.md"`
- `"Resolve comment on camera-session.md"`

All commits are made to the repository's default branch.

---

## UI Layout

### Three-Panel Layout

```
┌──────────┬────────────────────────────┬──────────────┐
│ Proposal │                            │   Comments   │
│   Tree   │    Document Content        │   Sidebar    │
│          │                            │              │
│ ▸ api/   │  # Camera Session          │ ┌──────────┐ │
│   rest.. │                            │ │ @jdoe    │ │
│ ▾ media/ │  The camera should         │ │ Should   │ │
│   overv. │  ██initialize lazily██     │ │ we also..│ │
│          │  when the user first       │ │          │ │
│          │  requests a preview.       │ │ ↩ Reply  │ │
│          │                            │ └──────────┘ │
│          │                 [Edit]     │              │
│          │                            │ ┌──────────┐ │
│          │                            │ │ Orphaned │ │
│          │                            │ │ (1)      │ │
│          │                            │ └──────────┘ │
├──────────┴────────────────────────────┴──────────────┤
│ @jdoe ▾  │  Rate: 4,892/5,000  │  Settings          │
└──────────────────────────────────────────────────────┘
```

### Responsive Behavior

- **Desktop (≥1024px):** Full three-panel layout
- **Tablet (768–1023px):** Tree collapses to icon rail, comments sidebar is a slide-over panel
- **Mobile (<768px):** Single column. Tree is a hamburger menu. Comments accessed via a bottom sheet or tab.

### Text Selection → Comment Popover

When the user selects text in the document surface:

1. A floating popover appears near the selection with a **"Comment"** button
2. Clicking it opens the comment form in the sidebar, scrolled into view
3. The selected text is captured and shown as a quote preview in the form
4. If the user clicks elsewhere (deselects), the popover disappears

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid PAT | AuthGate shows error, prompts re-entry |
| PAT expired / revoked | 401 → clear PAT, return to AuthGate with message |
| File conflict (SHA mismatch) | Error banner with "Refresh and retry" message |
| Network error | Toast notification with retry button |
| Rate limit exceeded | Banner showing when limit resets |
| Comment anchor orphaned | Comment moves to "Orphaned" section with warning |
| File not found (deleted externally) | Navigate to tree root with notification |

---

## Testing Strategy

### Unit Tests (Vitest)

- **Comment anchoring** — exact match, context match, fuzzy match, orphan detection
- **GitHub API client** — request construction, error handling, SHA conflict detection (mocked responses)

### Integration Tests (Vitest + React Testing Library)

- **AuthGate** — PAT validation flow, invalid PAT handling, logout
- **ProposalTree** — renders directory structure, navigation
- **DocumentView** — renders MilkdownDocument, save wiring, route compatibility
- **CommentsSidebar** — displays threads, reply flow, resolve/unresolve

### E2E Tests (Playwright)

- Full comment workflow: navigate → select text → add comment → verify commit
- Edit workflow: navigate → edit → save → verify content updated
- Conflict handling: simulate external change → verify error on save
- Auth flow: enter PAT → validate → see proposals

---

## Project Scaffolding

### Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview, architecture summary, setup instructions, development commands, deployment guide. Kept accurate as the codebase evolves. |
| `AGENTS.md` | AI agent coding guidelines: project conventions, directory structure, key patterns, testing approach, and common pitfalls. Updated whenever architecture changes. |

**README.md** includes:
- What the project is and how it works (architecture diagram)
- Prerequisites (Node.js, GitHub PAT)
- Local development setup (`npm install`, `npm run dev`)
- How to deploy (GitHub Actions workflow)
- How to configure (PAT, target repository)
- Directory structure overview

**AGENTS.md** includes:
- Project structure and module responsibilities
- Coding conventions (TypeScript strict, Tailwind utility classes, TanStack Query patterns)
- How to add new components, routes, and API calls
- Testing patterns and how to run tests
- Common mistakes to avoid

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and scripts |
| `vite.config.ts` | Vite configuration with GitHub Pages base path |
| `tsconfig.json` | TypeScript strict configuration |
| `tailwind.config.ts` | Tailwind configuration |
| `.eslintrc.cjs` | ESLint configuration |
| `.prettierrc` | Prettier configuration |
| `.gitignore` | Standard Vite/Node ignores |
| `.github/workflows/deploy.yml` | GitHub Actions: build + deploy to gh-pages branch on push to main |

### Directory Structure

```
src/
├── components/
│   ├── auth/          — AuthGate, AuthForm
│   ├── layout/        — AppLayout, Header
│   ├── tree/          — ProposalTree, TreeNode
│   ├── document/      — DocumentView, MilkdownDocument, RawEditor
│   ├── comments/      — CommentsSidebar, CommentThread, CommentForm
│   └── ui/            — Shared UI primitives (Button, Dialog, Toast, etc.)
├── lib/
│   ├── github/        — API client, types
│   └── comments/      — Anchoring logic, reconciliation
├── hooks/             — Shared React hooks
├── routes/            — Route components
├── types/             — Shared TypeScript types
├── App.tsx
├── main.tsx
└── index.css
```

---

## Development Workflow

The project is developed with a full edit → push → deploy → verify loop:

1. **Edit** — Code changes are made locally
2. **Push** — Changes are pushed to the repository via a GitHub PAT with repo access
3. **Deploy** — GitHub Actions builds and deploys to the `gh-pages` branch automatically on push to `main`
4. **Verify** — The live GitHub Pages site is opened in a browser to verify the deployed app works correctly
5. **Test** — Vitest unit/integration tests run locally; Playwright E2E tests run against the dev server

This enables AI-assisted development where the agent can make changes, push them, and verify the result on the live site.

---

## Open Questions Resolved

| Question | Decision |
|----------|----------|
| Same repo or separate repos? | Same repo |
| Public or private repo? | Private (PAT required for all access) |
| Editing experience? | View mode with edit toggle (not split-pane) |
| Comment anchoring? | Text-selection with quote + context |
| Commenter identity? | Derived from GitHub PAT user |
| State management? | TanStack Query + React useState/useReducer |
| Styling? | Tailwind CSS |
| Routing? | Hash-based (React Router) for GitHub Pages |
| Read method? | GitHub REST API for all reads (always fresh, PAT required anyway) |
| Concurrency? | Activity indicator + SHA-based optimistic locking |
