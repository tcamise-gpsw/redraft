# Proposal Review Workspace — Implementation Plan

**Goal:** Build a static React app on GitHub Pages that lets a small team create, review, and discuss technical proposals stored as markdown in a GitHub repo, with inline text-selection comments.

**Architecture:** A Vite-built React 19 SPA served from GitHub Pages. All data (proposals as `.md`, comments as sidecar `.comments.json`) lives in a single GitHub repo and is read/written via the GitHub REST API using a fine-grained PAT stored in localStorage. TanStack Query manages async state. Three-panel layout: proposal tree | document view | comments sidebar.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS, React Router (hash mode), TanStack Query, react-markdown + remark/rehype, @octokit/rest, nanoid, Vitest, Playwright

**Spec:** `docs/specs/2025-06-21-proposal-review-core-design.md`

**Commands** (defined in this plan since this is a greenfield project — no existing AGENTS.md):
- Dev server: `npm run dev`
- Build: `npm run build`
- Test: `npx vitest run`
- Lint: `npx eslint src/`
- Type check: `npx tsc --noEmit`
- Format: `npx prettier --check src/`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json` — dependencies and scripts
- Create: `vite.config.ts` — Vite config with `base` set for GitHub Pages
- Create: `tsconfig.json` — TypeScript strict mode config
- Create: `tsconfig.node.json` — Node-targeted config for vite.config.ts
- Create: `tailwind.config.ts` — Tailwind with content paths for `src/`
- Create: `postcss.config.js` — PostCSS with Tailwind and autoprefixer
- Create: `.eslintrc.cjs` — ESLint config for React + TypeScript
- Create: `.prettierrc` — Prettier config (2-space indent, single quotes, trailing commas)
- Create: `.gitignore` — Node + Vite ignores
- Create: `index.html` — Vite entry point with root div
- Create: `src/main.tsx` — React DOM root render
- Create: `src/App.tsx` — Minimal app shell rendering "Hello World"
- Create: `src/index.css` — Tailwind directives (`@tailwind base/components/utilities`)
- Create: `src/vite-env.d.ts` — Vite client type reference
- Create: `.github/workflows/deploy.yml` — GitHub Actions: install, build, deploy to gh-pages
- Create: `README.md` — Project overview, quick start, architecture summary (links to docs/ for details)
- Create: `docs/architecture.md` — Detailed architecture: component tree, data flow, GitHub API usage
- Create: `docs/development.md` — Local dev setup, commands, deployment guide, PAT configuration
- Create: `AGENTS.md` — AI agent coding guide: conventions, structure, patterns, testing, commands

**Behavior:**
- `npm install` succeeds with zero errors
- `npm run dev` starts a dev server that renders the app
- `npm run build` produces a `dist/` directory
- `npx tsc --noEmit` passes with no type errors
- README covers: what the project is, quick start (3 commands), architecture summary, links to docs/ for details
- docs/architecture.md covers: component architecture diagram, data flow, GitHub API endpoints, comment data model, routing
- docs/development.md covers: prerequisites, local dev setup, all npm scripts, PAT creation guide, GitHub Pages deployment, directory structure
- AGENTS.md covers: project structure, module responsibilities, coding conventions (TS strict, Tailwind utility classes, TanStack Query patterns), how to add components/routes/API calls, testing patterns, commands, common mistakes

**Checklist:**
- [x] `npm run dev` starts and renders the app in a browser
- [x] `npm run build` produces valid output
- [x] TypeScript compiles with no errors
- [x] Tailwind CSS is working (a utility class renders correctly)
- [x] ESLint and Prettier configs are valid
- [x] GitHub Actions deploy workflow is syntactically valid
- [x] README.md links to docs/ for detailed architecture and development guides
- [x] docs/architecture.md and docs/development.md contain all required sections
- [x] AGENTS.md contains all required sections

**Tests:**
- [x] No tests needed for this task — scaffolding only

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 2: Shared Types and GitHub API Client

**Files:**
- Create: `src/types/comments.ts` — CommentFile, CommentThread, CommentReply, Author interfaces
- Create: `src/types/github.ts` — GitHub API response types (TreeItem, FileContent, User, CommitInfo)
- Create: `src/types/proposals.ts` — ProposalNode type for the tree (name, path, type, children)
- Create: `src/lib/github/client.ts` — GitHubClient class wrapping @octokit/rest
- Create: `src/lib/github/types.ts` — Re-exports from types/ plus any internal-only types
- Create: `src/lib/github/index.ts` — Public module export
- Test: `src/lib/github/__tests__/client.test.ts`

**Interface:**

`GitHubClient` — constructed with `{ pat: string; owner: string; repo: string }`:
- `validateAuth(): Promise<User>` — calls `GET /user`, returns `{ login, avatarUrl }`, throws on 401
- `getTree(branch?: string): Promise<TreeItem[]>` — recursive tree listing, filters to `proposals/` prefix
- `getFileContent(path: string): Promise<{ content: string; sha: string }>` — base64 decodes content
- `createFile(path: string, content: string, message: string): Promise<{ sha: string }>` — PUT without sha
- `updateFile(path: string, content: string, sha: string, message: string): Promise<{ sha: string }>` — PUT with sha, throws `ConflictError` if sha mismatch (409 or GitHub's 422 "sha does not match")
- `getLatestCommit(path: string): Promise<CommitInfo | null>` — `GET /repos/:owner/:repo/commits?path=:path&per_page=1`, returns `{ author: { login, avatarUrl }, date, message }` or null
- `getRateLimit(): { remaining: number; limit: number; reset: Date }` — extracted from response headers, cached per-request

`ConflictError` — custom error class with `type: 'conflict'` for SHA mismatch

**Behavior:**
- All methods throw typed errors: `AuthError` (401), `NotFoundError` (404), `ConflictError` (409/422 sha mismatch), `RateLimitError` (403 with rate limit header), `NetworkError` (fetch failure)
- `getFileContent` handles the case where the file doesn't exist (404) — returns null or throws NotFoundError depending on caller needs. Use two signatures: `getFileContent(path, { optional: true })` returns `null`, default throws
- Rate limit info is extracted from every response's `x-ratelimit-*` headers and stored on the client instance

**Checklist:**
- [x] All type interfaces match the spec's data model exactly
- [x] GitHubClient constructs an Octokit instance with the provided PAT
- [x] `validateAuth` correctly calls GET /user and extracts login + avatar_url
- [x] `getTree` filters to proposals/ prefix and parses tree entries
- [x] `getFileContent` base64-decodes content and returns sha
- [x] `updateFile` sends sha and handles conflict errors
- [x] `createFile` works without sha
- [x] `getLatestCommit` returns the most recent commit for a path
- [x] Error classes are properly typed and distinguishable
- [x] Rate limit info is extracted and stored

**Tests:**
- [x] `npx vitest run src/lib/github`
- [x] Test `validateAuth` with mocked 200 and 401 responses
- [x] Test `getFileContent` with valid response and 404
- [x] Test `updateFile` with sha match and sha mismatch (conflict)
- [x] Test `getTree` parses tree response and filters to proposals/
- [x] Test error classification (401→AuthError, 404→NotFoundError, etc.)

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 3: Auth Flow and Settings

**Files:**
- Create: `src/lib/auth/storage.ts` — localStorage helpers for PAT, repo config, user info
- Create: `src/lib/auth/index.ts` — Public module export
- Create: `src/hooks/useAuth.ts` — Auth state hook: { user, pat, repo, isAuthenticated, login, logout, updateRepo }
- Create: `src/components/auth/AuthGate.tsx` — Wraps children; shows AuthForm if not authenticated
- Create: `src/components/auth/AuthForm.tsx` — PAT + owner/repo input form with validation
- Create: `src/routes/Settings.tsx` — Settings page: show current user, change repo, clear PAT (logout)
- Test: `src/lib/auth/__tests__/storage.test.ts`
- Test: `src/components/auth/__tests__/AuthGate.test.tsx`

**Interface:**

`storage.ts`:
- `getStoredAuth(): { pat: string; owner: string; repo: string; user: User } | null`
- `setStoredAuth(auth: { pat: string; owner: string; repo: string; user: User }): void`
- `clearStoredAuth(): void`

`useAuth` hook returns:
- `{ user: User | null; pat: string | null; repo: { owner: string; repo: string } | null; isAuthenticated: boolean; login: (pat: string, owner: string, repo: string) => Promise<void>; logout: () => void; updateRepo: (owner: string, repo: string) => void; }`
- `login()` validates the PAT via `GitHubClient.validateAuth()`, stores on success, throws on failure
- `updateRepo()` updates the stored owner/repo in localStorage and re-initializes the GitHubClient

`AuthGate` — renders children when authenticated, renders `AuthForm` otherwise. Passes `useAuth`'s `login` function to AuthForm.

`AuthForm` — form with fields: PAT (password input), Repository (text input, placeholder "owner/repo"). Submit button validates and calls `login()`. Shows error messages for invalid PAT or network errors. Shows loading spinner during validation.

**Behavior:**
- PAT field is `type="password"` to avoid accidental exposure
- Repository field validates format: must contain exactly one `/` separating non-empty owner and repo
- On successful login, the form disappears and children render
- On 401, form shows "Invalid token. Please check your PAT and try again."
- On network error, form shows "Unable to connect to GitHub. Check your network."
- Settings page shows current `@login` with avatar, current `owner/repo`, and a logout button
- Logout clears localStorage and returns to AuthGate

**Checklist:**
- [x] localStorage read/write/clear works correctly
- [x] AuthGate renders AuthForm when no stored auth
- [x] AuthGate renders children when auth exists
- [x] AuthForm validates PAT against GitHub API before storing
- [x] AuthForm validates repo format (owner/repo)
- [x] Error messages display for invalid PAT and network errors
- [x] Settings page shows user info and allows logout
- [x] Logout clears all stored data and returns to auth screen
- [x] If stored PAT becomes invalid (401 on any API call), auth is cleared

**Tests:**
- [x] `npx vitest run src/lib/auth src/components/auth`
- [x] Storage: set/get/clear round-trips correctly
- [x] AuthGate: renders form when unauthenticated, children when authenticated
- [x] AuthForm: shows error on invalid PAT, calls login on valid submit

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 4: App Shell, Routing, and Layout

**Files:**
- Create: `src/components/layout/AppLayout.tsx` — Three-panel responsive shell
- Create: `src/components/layout/Header.tsx` — Top bar with user avatar, rate limit, settings link
- Create: `src/components/ui/Toast.tsx` — Toast notification component for errors/success
- Create: `src/components/ui/Button.tsx` — Shared button primitive with variants
- Create: `src/components/ui/Dialog.tsx` — Modal dialog primitive
- Create: `src/components/ui/Spinner.tsx` — Loading spinner
- Create: `src/hooks/useToast.ts` — Toast state management hook
- Modify: `src/App.tsx` — Set up React Router (HashRouter), TanStack QueryClientProvider, route definitions, wrap in AuthGate
- Create: `src/routes/ProposalView.tsx` — Route component for `/#/proposals/:path` (placeholder, wired in Task 6)
- Create: `src/routes/ProposalEdit.tsx` — Route component for `/#/proposals/:path/edit` (placeholder, wired in Task 9)
- Create: `src/routes/Home.tsx` — Route component for `/#/` (renders tree + welcome message)

**Interface:**

`AppLayout` — accepts `{ sidebar: ReactNode; main: ReactNode; aside?: ReactNode }`. Renders three-panel layout:
- Left sidebar: fixed width ~240px on desktop, collapsible on tablet/mobile
- Center: flex-grow main content area
- Right aside: fixed width ~320px, slides in/out, hidden when no `aside` prop

`Header` — displays: user avatar + login (from useAuth), rate limit remaining/total (from a shared rate limit context or prop), Settings link

Routing setup in `App.tsx`:
- `HashRouter` wrapping everything
- `AuthGate` wrapping all routes
- `QueryClientProvider` wrapping AuthGate
- Routes: `/` → Home, `/proposals/*` → ProposalView, `/proposals/*/edit` → ProposalEdit, `/settings` → Settings
- The `*` wildcard captures nested paths (e.g., `media-pipeline/overview`)

**Behavior:**
- Responsive: desktop shows all three panels; tablet collapses sidebar to icon rail; mobile uses hamburger + bottom sheet
- Toast notifications appear in bottom-right, auto-dismiss after 5s, or dismissible manually
- TanStack QueryClient configured with: `staleTime: 30_000` (30s), `retry: 1`, default error handler that triggers toast
- All routes are lazy-loaded is optional — defer to implementer's judgment

**Checklist:**
- [x] Three-panel layout renders correctly at desktop width
- [x] Sidebar collapses at tablet breakpoint
- [x] Mobile layout shows single column with navigation controls
- [x] Header shows user info and rate limit
- [x] Hash-based routing works (navigating to `/#/proposals/test` renders ProposalView)
- [x] QueryClientProvider wraps the app
- [x] Toast notifications display and auto-dismiss
- [x] Settings route renders the Settings page from Task 3

**Tests:**
- [x] `npx vitest run src/components/layout`
- [x] AppLayout: renders three panels at desktop width
- [x] Routing: correct component renders for each route

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 5: Proposal Tree Sidebar

**Files:**
- Create: `src/components/tree/ProposalTree.tsx` — Left sidebar: fetches and displays proposal file tree
- Create: `src/components/tree/TreeNode.tsx` — Recursive tree node: folder (expandable) or file (link)
- Create: `src/components/tree/CreateProposalDialog.tsx` — Dialog for creating a new proposal
- Create: `src/hooks/useProposals.ts` — TanStack Query hook for fetching proposal tree
- Test: `src/components/tree/__tests__/ProposalTree.test.tsx`

**Interface:**

`useProposals` hook:
- Calls `GitHubClient.getTree()` via TanStack Query with key `['proposals', 'tree']`
- Returns `{ tree: ProposalNode[]; isLoading: boolean; error: Error | null }`
- Transforms flat GitHub tree entries into a nested `ProposalNode[]` structure

`ProposalNode` type (from `src/types/proposals.ts`):
- `{ name: string; path: string; type: 'file' | 'directory'; children?: ProposalNode[] }`

`ProposalTree` — renders a scrollable tree. Each `.md` file is a link navigating to `/#/proposals/:path`. Folders are expandable/collapsible. Shows a "New Proposal" button at the bottom.

`TreeNode` — recursive component. Folders render with expand/collapse chevron. Files render with a document icon. Current proposal (matching current route) is highlighted.

`CreateProposalDialog` — modal with: file path input (relative to `proposals/`), title input. On submit:
1. Validates path ends with `.md`
2. Creates the file via `GitHubClient.createFile()` with initial content `# {title}\n\n<!-- Write your proposal here -->`
3. Invalidates the tree query
4. Navigates to the new proposal

**Behavior:**
- Tree sorts: directories first, then files, both alphabetical
- Loading state shows skeleton/spinner in the sidebar
- Error state shows an error message with retry button
- Empty state (no proposals/) shows "No proposals yet" with create button
- The active proposal is visually highlighted in the tree
- Tree nodes show only the filename (not full path), with path visible on hover

**Checklist:**
- [x] Tree renders directory structure matching repo's `proposals/` contents
- [x] Folders expand/collapse
- [x] Clicking a file navigates to the proposal view
- [x] Current proposal is highlighted
- [x] "New Proposal" creates a file and navigates to it
- [x] Loading and error states render correctly
- [x] Tree is sorted (directories first, then alphabetical)

**Tests:**
- [x] `npx vitest run src/components/tree src/hooks`
- [x] Tree rendering: given a mock tree response, correct nodes render
- [x] Tree sorting: directories before files, alphabetical within each
- [x] Create proposal: dialog validates inputs, calls createFile

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 6: Markdown Document Viewer

**Files:**
- Create: `src/components/document/DocumentView.tsx` — Center panel: fetches and displays a proposal
- Create: `src/components/document/MarkdownRenderer.tsx` — Renders markdown with comment highlight overlays
- Create: `src/components/document/ActivityIndicator.tsx` — "Last edited by @user at time" line
- Create: `src/hooks/useProposal.ts` — TanStack Query hook for fetching a single proposal's content + comments
- Create: `src/lib/markdown/index.ts` — Markdown processing: `extractTextContent(renderedHtml: string): string` to get plain text from rendered markdown for anchor operations; `findTextRange(containerEl: HTMLElement, text: string): Range | null` to map a text string to a DOM Range for highlighting
- Modify: `src/routes/ProposalView.tsx` — Wire up DocumentView with CommentsSidebar (sidebar placeholder until Task 8)

**Interface:**

`useProposal(path: string)` hook:
- Fetches both the `.md` file and `.comments.json` (optional, 404 → empty comments) in parallel
- Query keys: `['proposal', path, 'content']` and `['proposal', path, 'comments']`
- Returns `{ content: string; sha: string; comments: CommentFile | null; commentsSha: string | null; isLoading; error }`
- Also fetches latest commit info via `getLatestCommit(path)`

`MarkdownRenderer` — accepts `{ content: string; comments: CommentThread[]; onSelectComment: (id: string) => void; onTextSelect: (quote: string, context: { prefix: string; suffix: string }) => void }`:
- Renders markdown using react-markdown with remark-gfm
- Comment highlights use simple `indexOf` matching in this task. The full anchoring engine (`resolveAnchor`) is built in Task 7 and integrated into the sidebar in Task 8. Task 6 only needs to locate exact quote matches for initial highlight rendering.
- For each matched comment anchor, wraps the matching text range in a highlight `<mark>` element with the comment's ID as a data attribute
- Clicking a highlight calls `onSelectComment(commentId)`
- Text selection triggers `onTextSelect` with the selected text and surrounding context (up to 100 chars before/after)

`DocumentView` — accepts `{ path: string }`:
- Uses `useProposal` to fetch content
- Renders MarkdownRenderer in view mode
- Shows "Edit" button that navigates to `/#/proposals/:path/edit`
- Shows ActivityIndicator with last commit info
- Loading state: centered spinner
- Error state: error message with back-to-tree link

`ActivityIndicator` — accepts `{ commit: CommitInfo | null }`:
- Renders "Last edited by @login · 2 hours ago" with avatar
- Uses relative time formatting
- Renders nothing if commit is null

**Behavior:**
- Markdown renders with GitHub-flavored markdown support (tables, task lists, code blocks, etc.)
- Code blocks have syntax highlighting (use rehype-highlight or similar)
- Comment highlights are subtle background color (e.g., light yellow) that darken on hover
- Clicking a highlight scrolls the corresponding comment into view in the sidebar
- When a user selects text, the prefix/suffix context is extracted from the rendered text content (not the raw markdown) to enable anchor matching

**Checklist:**
- [x] Markdown renders correctly with GFM support
- [x] Comment highlights appear on text that has anchored comments (using simple indexOf matching; full anchoring engine is Task 7)
- [x] Clicking a highlight calls onSelectComment with the correct ID
- [x] Text selection captures quote + surrounding context
- [x] Activity indicator shows last editor and relative time
- [x] Edit button navigates to the edit route
- [x] Loading and error states display properly
- [x] 404 on .comments.json is handled gracefully (empty comments)

**Tests:**
- [x] `npx vitest run src/components/document src/hooks`
- [x] MarkdownRenderer: renders basic markdown, GFM tables, code blocks
- [x] useProposal: handles successful fetch, 404 on comments, network error
- [x] ActivityIndicator: renders commit info, handles null

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 7: Comment Anchoring Engine

**Files:**
- Create: `src/lib/comments/anchoring.ts` — Pure functions for anchor resolution and fuzzy matching
- Create: `src/lib/comments/index.ts` — Public module export
- Test: `src/lib/comments/__tests__/anchoring.test.ts`

**Interface:**

`resolveAnchor(documentText: string, anchor: { quote: string; quoteContext: { prefix: string; suffix: string } }): AnchorResult`

`AnchorResult`:
- `{ status: 'exact' | 'context' | 'fuzzy' | 'orphaned'; startIndex: number; endIndex: number; matchedText: string }` when found
- `{ status: 'orphaned'; startIndex: -1; endIndex: -1; matchedText: '' }` when not found

`createAnchor(documentText: string, selectedText: string, selectionStartIndex: number): { quote: string; quoteContext: { prefix: string; suffix: string } }`
- Extracts up to 100 chars before and after the selection from documentText

`longestCommonSubstring(a: string, b: string): string` — internal helper for fuzzy matching

`similarity(a: string, b: string): number` — returns 0-1 similarity score based on LCS length / max length

**Behavior:**

`resolveAnchor` resolution strategy (in order):
1. **Exact match**: `documentText.indexOf(quote)`. If found, return with status `'exact'`.
   - If multiple exact matches: prefer the one where surrounding context also matches
2. **Context match**: Search for `prefix + quote + suffix` with tolerance for whitespace changes and minor edits in prefix/suffix. Accept if quote portion is found verbatim within a context window.
3. **Fuzzy match**: Find the substring in documentText with highest similarity to `quote`. Accept if `similarity >= 0.7`. Return the best match position.
4. **Orphaned**: All strategies failed. Return orphaned result.

`createAnchor`:
- `prefix` = 100 chars before `selectionStartIndex` (or fewer if near document start)
- `suffix` = 100 chars after `selectionStartIndex + selectedText.length` (or fewer if near document end)
- Trim prefix to start at a word boundary; trim suffix to end at a word boundary

**Edge cases:**
- Empty quote string → orphaned immediately
- Document is empty → all anchors orphaned
- Multiple identical quotes in document → context match disambiguates
- Quote spans a line break → works correctly (operates on full text, not per-line)
- Very long quotes (>500 chars) → exact match still works, fuzzy may be slow but acceptable for MVP

**Checklist:**
- [x] Exact match finds quote at correct position
- [x] Context match finds quote when prefix/suffix have minor changes
- [x] Fuzzy match finds quote when text has been lightly edited (≥70% similarity)
- [x] Orphaned status returned when no match above threshold
- [x] createAnchor extracts correct prefix/suffix from document
- [x] Multiple identical quotes disambiguated by context
- [x] Edge cases handled: empty quote, empty document, line breaks in quote

**Tests:**
- [x] `npx vitest run src/lib/comments`
- [x] Exact match: quote exists verbatim in document
- [x] Exact match with multiple occurrences: context disambiguates
- [x] Context match: quote present but prefix/suffix slightly changed
- [x] Fuzzy match: quote text has been edited (word added/removed), similarity ≥0.7
- [x] Fuzzy match rejected: similarity <0.7 → orphaned
- [x] createAnchor: extracts prefix/suffix correctly, respects word boundaries
- [x] Edge cases: empty inputs, line breaks, very long quotes

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 8: Comments Sidebar and Text Selection

**Files:**
- Create: `src/components/comments/CommentsSidebar.tsx` — Right panel: renders all comments for current proposal
- Create: `src/components/comments/CommentThread.tsx` — Single comment thread with replies
- Create: `src/components/comments/CommentBody.tsx` — Individual comment/reply display
- Create: `src/components/comments/CommentForm.tsx` — New comment input form
- Create: `src/components/comments/ReplyForm.tsx` — Reply input within a thread
- Create: `src/components/comments/OrphanedComments.tsx` — Section for unanchored comments
- Create: `src/components/comments/SelectionPopover.tsx` — Floating "Comment" button on text selection
- Create: `src/hooks/useComments.ts` — Comment CRUD operations via GitHub API
- Modify: `src/routes/ProposalView.tsx` — Wire CommentsSidebar into AppLayout's aside slot, connect selection/comment flows
- Test: `src/components/comments/__tests__/CommentsSidebar.test.tsx`
- Test: `src/hooks/__tests__/useComments.test.ts`

**Interface:**

`useComments(path: string)` hook:
- `addComment(thread: Omit<CommentThread, 'id' | 'createdAt' | 'replies'>): Promise<void>` — reads current .comments.json, appends new thread with generated id + timestamp, commits. Creates file if it doesn't exist (version: 1, comments: []).
- `addReply(threadId: string, reply: Omit<CommentReply, 'id' | 'createdAt'>): Promise<void>` — reads, finds thread, appends reply, commits
- `resolveThread(threadId: string): Promise<void>` — reads, toggles resolved flag, commits
- All mutations invalidate the `['proposal', path, 'comments']` query
- Each mutation uses SHA-based conflict detection — read latest SHA before writing

`CommentsSidebar` — accepts `{ comments: CommentThread[]; documentText: string; activeCommentId: string | null; onCommentClick: (id: string) => void; pendingSelection: { quote: string; context: { prefix: string; suffix: string } } | null; onClearSelection: () => void }`:
- Resolves each comment's anchor against `documentText` using `resolveAnchor()`
- Sorts comments by their resolved position in the document (orphaned at bottom)
- Renders `CommentThread` for each resolved/active comment, `OrphanedComments` section at bottom
- When `pendingSelection` is non-null, shows `CommentForm` at the top of the sidebar

`CommentThread` — displays: author avatar + login, relative timestamp, quoted text preview, comment body, resolve/unresolve button, reply list, reply form toggle

`CommentForm` — shows the selected quote, text input for comment body, Submit + Cancel buttons

`SelectionPopover` — listens to `document.onselectionchange`. When a text selection exists within the MarkdownRenderer area, positions a floating button near the selection. Clicking it calls `onTextSelect` from MarkdownRenderer, which sets `pendingSelection` in ProposalView state.

**Behavior:**
- Comments are ordered by document position: exact/context/fuzzy matches sorted by startIndex, orphaned last
- Clicking a comment in sidebar scrolls to its highlight in the document (via `onCommentClick`)
- The active comment (clicked or corresponding to clicked highlight) is visually emphasized in the sidebar
- Adding a comment: SelectionPopover → CommentForm → useComments.addComment → cache invalidation → new comment appears
- Replying: expand reply form in thread → type → submit → useComments.addReply
- Resolving: click resolve button → useComments.resolveThread → thread collapses visually (still visible but dimmed)
- Orphaned comments show a ⚠️ warning and the original quote text (even though it no longer matches)
- Commit messages follow spec format: "Add comment on {filename}", "Reply to comment on {filename}", "Resolve comment on {filename}"
- Conflict on comment write: toast error "File was modified since you loaded it. Please refresh and re-apply your changes."

**Checklist:**
- [x] Comments render sorted by document position
- [x] Orphaned comments appear in separate section at bottom
- [x] Text selection shows popover near selection
- [x] Clicking popover opens comment form in sidebar
- [x] Submitting comment creates a .comments.json commit
- [x] Reply to a comment appends to thread and commits
- [x] Resolve/unresolve toggles the resolved flag and commits
- [x] Clicking a comment scrolls to highlight in document
- [x] Clicking a highlight scrolls to comment in sidebar
- [x] Active comment is visually highlighted in sidebar
- [x] SHA conflict shows appropriate error message
- [x] Comment file created on first comment (version: 1)

**Tests:**
- [x] `npx vitest run src/components/comments src/hooks`
- [x] CommentsSidebar: renders threads sorted by position, orphaned at bottom
- [x] CommentForm: validates non-empty body, calls addComment on submit
- [x] useComments: addComment creates file when none exists, appends when exists
- [x] useComments: addReply finds thread and appends
- [x] useComments: resolveThread toggles flag
- [x] Conflict handling: SHA mismatch triggers error

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 9: Document Editor

**Files:**
- Create: `src/components/document/MarkdownEditor.tsx` — Raw markdown textarea with save/cancel
- Modify: `src/routes/ProposalEdit.tsx` — Wire up editor with GitHub API write flow
- Create: `src/hooks/useProposalEdit.ts` — Edit state and save mutation
- Test: `src/components/document/__tests__/MarkdownEditor.test.tsx`

**Interface:**

`MarkdownEditor` — accepts `{ initialContent: string; onSave: (content: string) => Promise<void>; onCancel: () => void; isSaving: boolean }`:
- Full-width textarea with monospace font for raw markdown editing
- Shows character count and line count
- Save button (disabled when isSaving) and Cancel button
- Unsaved changes warning: if user navigates away with modifications, show a confirmation dialog

`useProposalEdit(path: string)` hook:
- `save(content: string, sha: string): Promise<void>` — calls `GitHubClient.updateFile()` with auto-generated commit message "Update proposal: {filename}"
- Handles `ConflictError` — shows toast with conflict message
- On success: invalidates proposal content query, navigates back to view route

`ProposalEdit` route:
- Fetches current content via `useProposal(path)`
- Renders `MarkdownEditor` with fetched content
- On save: calls `useProposalEdit.save()`
- On cancel: navigates back to view route (with unsaved changes check)

**Behavior:**
- Textarea is full-height of the center panel
- Tab key inserts 2 spaces (not focus change) — standard markdown editor behavior
- Cancel with unsaved changes: browser confirm dialog "You have unsaved changes. Discard?"
- Save with SHA conflict: toast error, user must refresh
- On successful save: navigate to view mode, show toast "Proposal saved"
- Loading state while fetching content: spinner in center panel

**Checklist:**
- [x] Editor renders with current markdown content
- [x] Save commits content to GitHub and navigates to view
- [x] Cancel navigates to view (with confirmation if unsaved changes)
- [x] SHA conflict shows error toast
- [x] Tab key inserts spaces, not focus change
- [x] Unsaved changes warning on navigation

**Tests:**
- [x] `npx vitest run src/components/document`
- [x] MarkdownEditor: renders content, calls onSave on save button click
- [x] MarkdownEditor: calls onCancel on cancel button click
- [x] useProposalEdit: save calls updateFile with correct args
- [x] useProposalEdit: ConflictError triggers toast

**Commit:**
- [x] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 10: Integration, Polish, and E2E Tests

**Files:**
- Modify: `src/routes/ProposalView.tsx` — Final wiring: document highlights ↔ sidebar scrolling, selection popover ↔ comment form, all data flows connected
- Modify: `src/components/layout/Header.tsx` — Wire rate limit display from GitHubClient
- Modify: `src/App.tsx` — Global 401 interceptor that clears auth on any unauthorized response
- Create: `e2e/auth.spec.ts` — Auth flow E2E test
- Create: `e2e/proposals.spec.ts` — Proposal viewing and tree navigation E2E test
- Create: `e2e/comments.spec.ts` — Comment workflow E2E test
- Create: `e2e/editing.spec.ts` — Edit workflow E2E test
- Create: `playwright.config.ts` — Playwright configuration for E2E tests
- Modify: `README.md` — Update with final architecture, all commands, usage guide
- Modify: `AGENTS.md` — Update with final patterns, all module responsibilities, testing commands

**Behavior:**

Integration wiring in `ProposalView`:
- State: `activeCommentId`, `pendingSelection`
- `MarkdownRenderer.onSelectComment` → sets `activeCommentId`, scrolls sidebar to that comment
- `MarkdownRenderer.onTextSelect` → sets `pendingSelection`, which opens CommentForm in sidebar
- `CommentsSidebar.onCommentClick` → sets `activeCommentId`, scrolls document to highlight
- Clear `pendingSelection` when comment is submitted or cancelled

Global 401 interceptor:
- Wrap TanStack Query's `queryFn`/`mutationFn` or use Octokit's error hooks
- On any 401 response: clear stored auth, navigate to root (AuthGate will show)
- Show toast: "Your session has expired. Please re-enter your PAT."

Rate limit display in Header:
- Read from GitHubClient's cached rate limit info
- Display: "API: {remaining}/{limit}"
- Warn visually (amber text) when remaining < 100
- When remaining hits 0 (rate limit exceeded): show a banner with "API rate limit exceeded. Resets at {reset time}." All API calls are paused until reset.

E2E tests (Playwright against real browser):
- Run against `npm run dev` with a development GitHub PAT provided by the project owner
- Playwright is the primary verification tool during development — each task's interactive behavior should be validated by launching a browser and testing the actual UI, not just unit tests
- Auth flow: enter PAT + repo → validate → see proposal tree
- Proposal view: navigate to proposal → see rendered markdown
- Comment flow: select text → popover appears → add comment → comment visible in sidebar
- Edit flow: click Edit → modify content → Save → see updated content
- Conflict handling: simulate external SHA change → save → verify conflict error toast

Documentation updates:
- README: final architecture diagram, all npm scripts, PAT setup guide, deployment instructions
- AGENTS.md: complete module map, testing instructions, all conventions established during implementation

**Checklist:**
- [x] Clicking a comment highlight scrolls to comment in sidebar
- [x] Clicking a comment in sidebar scrolls to highlight in document
- [x] Text selection → popover → comment form → submit → commit → visible comment (full flow)
- [x] 401 on any API call clears auth and shows AuthGate
- [x] Rate limit displays in header; exceeded state shows reset banner
- [x] E2E auth test passes
- [x] E2E proposal viewing test passes
- [x] E2E comment workflow test passes
- [x] E2E edit workflow test passes
- [x] README.md is comprehensive and accurate
- [x] AGENTS.md reflects final architecture and conventions

**Tests:**
- [x] `npx playwright test`
- [x] All E2E tests pass against dev server with real browser
- [x] Key interactive flows verified visually via Playwright during development

**Commit:**
- [ ] `git status --short`, `git add` relevant untracked files, `aicommits --all -y` with `pty: true`

---

### Task 11: Final Validation

**Checks:**
- [ ] Full test suite passes: `npx vitest run`
- [ ] E2E tests pass: `npx playwright test`
- [ ] Type check clean: `npx tsc --noEmit`
- [ ] Lint clean: `npx eslint src/`
- [ ] Format clean: `npx prettier --check src/`
- [ ] Build succeeds: `npm run build`
- [ ] Dev server starts and app renders: `npm run dev`
- [ ] All acceptance criteria from Tasks 1-10 verified
- [ ] No TODO/FIXME/HACK comments left in source code
- [ ] README.md and AGENTS.md are accurate and complete
- [ ] All git changes committed with descriptive messages
