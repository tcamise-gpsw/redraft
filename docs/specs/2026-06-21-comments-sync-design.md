# Comments Sync Design — Local-First Cache

Replace the write-through comment model (every mutation = 2–3 GitHub API calls) with a local-first store: one read on load, in-memory mutations, one write on explicit user save.

## Problem

The original `useComments` hook wrote to GitHub on every user action:

| Action | API calls |
|---|---|
| `addComment` | GET comments + PUT new file + GET refetch = **3** |
| `addReply` | GET comments + PUT update + GET refetch = **3** |
| `resolveThread` | GET comments + PUT update + GET refetch = **3** |

A reviewer adding five comments and resolving two burned **21 API calls** before touching the proposal itself. On a new proposal with three reviewers active in the same session, rate limits were routinely hit.

Contributing factors:
- `staleTime: 10_000` (10 seconds) meant every window focus event re-fetched all three proposal queries (content, comments, latest commit)
- `useProposal` fired those three queries on every mount; both `ProposalView` and `DocumentView` mounted it — TanStack Query deduplicated the network requests but the re-fetch triggers stacked up

## Solution

Local-first comment store with explicit save.

- `useComments` becomes the single owner of comment state. It loads once (`staleTime: Infinity`) and holds a local draft in React state. All mutations update the draft synchronously — no network calls.
- `saveComments()` performs a single write (create or update) when the user explicitly clicks **Save**.
- A dirty-state banner in the sidebar signals unsaved changes.
- `staleTime` raised to 5 minutes globally, eliminating the refetch churn on window focus.

## API rate limit comparison

| Scenario | Before | After |
|---|---|---|
| Page load | 3 calls (content + comments + commit) | 2 calls (content + commit) |
| Add 5 comments | +15 calls | 0 calls |
| Resolve 3 threads | +9 calls | 0 calls |
| Explicit save | — | 1 call |
| **Total (same session)** | **27 calls** | **3 calls** |

---

## Architecture

### Component data flow

```
ProposalView
├── useComments(path)          ← single source of truth for comment state
│   ├── useQuery [load once, staleTime: Infinity]
│   ├── localThreads (useState)
│   ├── localSha    (useState)
│   ├── isDirty     (useState)
│   └── isSaving    (useState)
│
├── useProposal(path)          ← content + commit only (no longer loads comments)
│
├── DocumentView
│   └── comments={threads}     ← prop, not fetched internally
│
└── CommentsSidebar
    ├── comments={threads}
    ├── addComment / addReply / resolveThread  ← props from useComments
    ├── saveComments / isDirty / isSaving      ← props from useComments
    └── [Save banner shown when isDirty]
```

### `useComments` state machine

```
LOADING ──(query resolves)──► IDLE
  IDLE ──(any mutation)──────► DIRTY
 DIRTY ──(saveComments)──────► SAVING
SAVING ──(success)──────────► IDLE
SAVING ──(error)────────────► DIRTY   (isDirty stays true, user can retry)
 any  ──(path changes)──────► LOADING  (local state reset)
```

### `useComments` contract

```typescript
function useComments(path: string): {
  threads:      CommentThread[];   // current (possibly unsaved) state
  isLoading:    boolean;           // true only during the initial fetch
  isDirty:      boolean;           // unsaved changes exist
  isSaving:     boolean;           // save in flight

  // Synchronous — update local state only, no network calls
  addComment(thread: Omit<CommentThread, 'id' | 'createdAt' | 'replies'>): void;
  addReply(threadId: string, reply: Omit<CommentReply, 'id' | 'createdAt'>): void;
  resolveThread(threadId: string): void;

  // Async — one GitHub write; throws on conflict with a user-readable message
  saveComments(): Promise<void>;
}
```

### Load → seed → mutate → save sequence

```
Mount
  │
  ├─► GET /proposals/doc.comments.json  (once per path, cached forever)
  │       │
  │       └─► setLocalThreads([...])    seed local state
  │           setLocalSha('abc123')
  │
User action (addComment / addReply / resolveThread)
  │
  └─► setLocalThreads(updater)          in-memory only
      setIsDirty(true)                  banner appears

User clicks Save
  │
  ├─► localSha ?
  │     yes → PUT /proposals/doc.comments.json (sha=localSha)
  │     no  → POST /proposals/doc.comments.json  (new file)
  │
  └─► setLocalSha(result.sha)
      setIsDirty(false)
```

---

## Changed files

| File | Change |
|---|---|
| `src/hooks/useComments.ts` | Full rewrite — local store, explicit save |
| `src/hooks/useProposal.ts` | Drop `commentsQuery`; return no longer includes `comments`/`commentsSha` |
| `src/routes/ProposalView.tsx` | Call `useComments(path)`; thread `threads` + mutations down as props |
| `src/components/document/DocumentView.tsx` | Accept `comments: CommentThread[]` as a prop instead of reading from `useProposal` |
| `src/components/comments/CommentsSidebar.tsx` | Remove internal `useComments` call; accept mutations + save state as props; add save banner |
| `src/App.tsx` | `staleTime`: 10 s → 5 min |

## Trade-offs and known behavior

**Multi-user edits**: If two reviewers add comments concurrently without refreshing, the second save will receive a SHA conflict error from GitHub. The error message instructs the user to refresh and re-apply. This is the same behavior as the previous write-through model (which checked SHA on every action) — the window of vulnerability is wider now (the entire session vs. per-action), but the failure mode is identical and recoverable.

**Stale comment data**: Comments are not automatically re-fetched after the initial load. A hard page reload fetches fresh data. For short-lived review sessions, this is acceptable.

**Brief "No comments yet" flash**: If a proposal has comments, the sidebar may briefly show the empty state until the initial `useComments` query resolves. This is a minor UX trade-off; the document renders immediately without waiting for comments.

**Comment highlights in editor**: `DocumentView` now receives `threads` as a prop from `ProposalView`. The Milkdown highlight decorations update whenever the parent re-renders with a new `threads` value (after any local mutation). This is correct.
