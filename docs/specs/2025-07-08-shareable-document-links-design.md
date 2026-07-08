# Shareable Document Links

**Issue:** [#14 — Shareable document links (encode repo + branch in URL)](https://github.com/tcamise-gpsw/redraft/issues/14)
**Date:** 2025-07-08

## Summary

Make ReDraft links self-contained by encoding `repo` and `branch` as query params in the hash URL, so pasting a link to another user reliably opens the same document in the same context.

## Problem

Today, a ReDraft link like `#/d/docs/spec.md` only resolves correctly if the recipient's `localStorage` already holds the same repo and branch. Repo, branch, and PAT are stored in `localStorage` — only the document path lives in the URL.

| Context       | Storage            | In the link?  |
| ------------- | ------------------ | :-----------: |
| Document path | URL hash (`#/d/…`) |       ✓       |
| Owner/repo    | `localStorage`     |       ✗       |
| Branch        | `localStorage`     |       ✗       |
| PAT           | `localStorage`     | ✗ (by design) |

## URL Format

Query params inside the hash fragment, using react-router's `useSearchParams`:

```
#/d/docs/spec.md?repo=acme/proj&branch=review-1
```

Both params are optional. When absent, the app falls back to `localStorage` (current behavior).

**Precedence:** URL params > `localStorage` > `defaultBranch` (from GitHub API).

## Architecture

### New: `parseShareableParams` utility

**File:** `src/lib/url.ts`

A pure function that extracts `repo` and `branch` from `window.location.hash`. Works anywhere — no React Router dependency.

```ts
interface ShareableParams {
  repo: { owner: string; repo: string } | null;
  branch: string | null;
}

function parseShareableParams(hash?: string): ShareableParams;
```

Parses the query string portion of the hash fragment. Validates the `repo` param contains exactly one `/`. Returns `null` for malformed or missing values.

### New: `useShareableLink` hook

**File:** `src/hooks/useShareableLink.ts`

React hook that wraps `useSearchParams()` for reactive URL param reading + link building. **Must be used inside `HashRouter`.**

```ts
interface ShareableLinkState {
  /** repo from URL params, e.g. { owner: "acme", repo: "proj" } */
  urlRepo: { owner: string; repo: string } | null;
  /** branch from URL params */
  urlBranch: string | null;
  /** Build a shareable URL for the current context */
  buildLink: (docPath?: string) => string;
  /** Copy the current context link to clipboard. Returns true on success. */
  copyLink: (docPath?: string) => Promise<boolean>;
}
```

`buildLink` constructs: `${origin}${pathname}#/d/${docPath}?repo=${owner}/${repo}&branch=${branch}`. When no `docPath` is provided (e.g. on the Home route), the link points to `#/?repo=…&branch=…`.

Consumed by:

- `ShareableLinkBridge` — applies URL overrides to auth state on mount (inside router).
- `Header` — Copy Link button (inside router).

**Not** consumed by `AuthForm` — see below.

### Modified: `AuthProvider` (`src/hooks/useAuth.ts`)

#### `loadBranchState` — new `overrideBranch` param

```ts
async function loadBranchState(
  pat: string,
  owner: string,
  repo: string,
  overrideBranch?: string, // ← new
): Promise<BranchState>;
```

When `overrideBranch` is provided:

1. Use it as the branch instead of `getStoredBranch(owner, repo)`.
2. Persist it to `localStorage` via `setStoredBranch(owner, repo, overrideBranch)` so subsequent navigation stays consistent.

When absent, current behavior is preserved (read from `localStorage`, fall back to `defaultBranch`).

#### `updateRepo` — new `overrideBranch` param

```ts
updateRepo: (owner: string, repo: string, sidecarBranch?: string, overrideBranch?: string) => void;
```

Forwards `overrideBranch` to `loadBranchState`. This eliminates the async race: the branch decision happens inside the async callback, not in a separate effect that could be clobbered.

#### `login` — accept `overrideBranch`

`login` gains an optional `overrideBranch` param, forwarded to `loadBranchState`. This is called by `AuthForm` when URL params specify a branch. `AuthProvider` itself does **not** read URL params — it remains router-unaware.

### Modified: `AuthForm` (`src/components/auth/AuthForm.tsx`)

`AuthForm` renders **outside** `HashRouter` (via `AuthGate` → before `AppShell` → before `HashRouter`), so it cannot use `useSearchParams`. Instead, it calls `parseShareableParams(window.location.hash)` on mount to read URL params.

When a valid `repo` is found, the repository input field is prefilled with `"owner/repo"`. The user only needs to enter their PAT and click Connect.

After successful `login`, the URL-specified branch is applied via the `overrideBranch` param on `login`.

### Modified: `Header` (`src/components/layout/Header.tsx`)

Add a **Copy Link** button in the right section (alongside rate-limit and Settings). Remote mode only — hidden in local mode.

**UX:**

- Default state: link icon + "Copy link" text.
- On click: calls `copyLink(currentDocPath)` from `useShareableLink`.
- Success: button text changes to "Copied!" with a checkmark icon for ~2 seconds, then reverts.
- The button builds the link from current auth state (`repo`, `branch`) and the current route's document path (if on `/d/*`).

### Modified: `BranchSelector` (`src/components/tree/BranchSelector.tsx`)

#### Bidirectional URL sync

When `handleSelect` changes the branch, also update the URL search params so the address bar stays accurate. This is best-effort — we update via `setSearchParams` alongside the existing `setBranch` call.

Similarly, when `updateRepo` changes the repo context, URL params are updated.

This keeps the URL bar as a live shareable link without requiring the Copy button.

### New: `ShareableLinkBridge` component

**File:** `src/components/ShareableLinkBridge.tsx`

A thin component rendered inside `HashRouter` (in `AppBody`). On mount:

1. Reads URL params via `useShareableLink`.
2. Compares `urlRepo` / `urlBranch` against current auth state from `useAuth()`.
3. If URL repo differs from current repo → calls `updateRepo(owner, repo, undefined, urlBranch)`.
4. If URL repo matches but URL branch differs → calls `setBranch(urlBranch)`.
5. Renders nothing (`null`).

**Why a bridge?** `AuthProvider` is rendered above `HashRouter` in the component tree (`App` → `AuthProvider` → … → `AppBody` → `HashRouter`), so it cannot use `useSearchParams`. The bridge lives inside the router and pushes URL overrides into auth state via the existing `useAuth()` API.

### Integration: How URL params flow through the system

**Component tree (relevant nesting):**

```
App → AuthProvider → ToastProvider → AuthGate → AppShell → QueryClientProvider → AppBody → HashRouter → [Header, Routes, ShareableLinkBridge]
```

**Flow:**

```
User lands on #/d/spec.md?repo=acme/proj&branch=review-1
│
├─ Authenticated?
│   ├─ YES: ShareableLinkBridge reads params (inside HashRouter)
│   │   ├─ URL repo ≠ current repo?
│   │   │   └─ updateRepo(owner, repo, undefined, overrideBranch)
│   │   │       └─ loadBranchState uses overrideBranch → no race
│   │   ├─ URL repo = current repo, URL branch ≠ current branch?
│   │   │   └─ setBranch(urlBranch)
│   │   └─ All match → no-op
│   │
│   └─ NO: AuthGate renders AuthForm (OUTSIDE HashRouter)
│       ├─ AuthForm calls parseShareableParams(hash) on mount
│       ├─ Repo field prefilled from parsed URL params
│       └─ On login success → login(pat, owner, repo, overrideBranch)
│           └─ After auth, ShareableLinkBridge also runs (now authenticated)
│              and applies any remaining URL overrides
│
└─ ProposalView reads doc path from route params (unchanged)
```

## Scope boundaries

**In scope:**

- `repo` and `branch` query params in hash URLs
- URL params take precedence over `localStorage`
- Race condition fix via `overrideBranch` threading
- Copy Link button in Header (remote mode only)
- AuthForm repo prefill from URL
- Bidirectional URL ↔ state sync (best effort)
- Tests for URL param parsing, precedence, copy-link output, and auth prefill

**Out of scope:**

- `sidecarBranch` in URL params (can be added later)
- Comment/selection anchoring in URL (future feature)
- Local mode cross-machine sharing (inherently impossible)
- PAT in URL (explicitly forbidden)

## Error handling

| Scenario                                  | Behavior                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| URL `repo` param malformed (missing `/`)  | Ignore param, fall back to `localStorage`                                                                                             |
| URL `branch` doesn't exist on the repo    | GitHub API returns 404 for file fetches; existing error handling surfaces this. Branch param is still applied (user may need to fix). |
| `clipboard.writeText` fails (permissions) | Copy Link button shows "Failed" briefly, then reverts. No crash.                                                                      |
| URL has `repo` but no `branch`            | Apply repo override; branch falls back to `localStorage` → `defaultBranch`                                                            |
| URL has `branch` but no `repo`            | Apply branch override to current repo context                                                                                         |

## Testing

### Unit tests (`vitest`)

1. **`parseShareableParams`** — returns correct repo and branch for various hash shapes (both present, one present, malformed, absent).
2. **`buildLink` output** — given a repo, branch, and optional doc path, produces the expected URL string. Never includes PAT.
3. **`loadBranchState` with `overrideBranch`** — when override is provided, it's used instead of `localStorage`; also verify it's persisted to `localStorage`.
4. **`AuthForm` prefill** — when URL params are present, the repo field is initialised to `owner/repo`.
5. **Precedence** — URL branch beats `localStorage` branch; URL repo beats `localStorage` repo.

### E2E tests (`playwright`)

1. **Shareable link round-trip** — navigate to a doc, click Copy Link, open the copied URL in a new context, verify same doc/repo/branch are loaded (after auth).
2. **Auth prefill flow** — open a shared link unauthenticated, verify repo field is prefilled, complete auth, verify correct branch loads.

## Files changed

| File                                     | Change                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/url.ts`                         | **New** — `parseShareableParams` utility (router-independent URL parsing) |
| `src/hooks/useShareableLink.ts`          | **New** — hook for reactive URL param reading + link building/copying     |
| `src/components/ShareableLinkBridge.tsx` | **New** — applies URL overrides to auth state inside `HashRouter`         |
| `src/hooks/useAuth.ts`                   | Add `overrideBranch` to `loadBranchState`, `updateRepo`, `login`          |
| `src/components/auth/AuthForm.tsx`       | Prefill repo from URL params via `parseShareableParams`                   |
| `src/components/layout/Header.tsx`       | Add Copy Link button (remote mode only)                                   |
| `src/components/tree/BranchSelector.tsx` | Update URL search params on branch change                                 |
| `src/App.tsx`                            | Render `ShareableLinkBridge` inside `AppBody`                             |
| `src/lib/url.test.ts`                    | **New** — unit tests for `parseShareableParams`                           |
| `src/hooks/useShareableLink.test.ts`     | **New** — unit tests for hook                                             |
| `src/hooks/useAuth.test.ts`              | Add tests for `overrideBranch` precedence                                 |
| `src/components/auth/AuthForm.test.tsx`  | Add test for repo prefill                                                 |
| `e2e/shareable-links.spec.ts`            | **New** — E2E round-trip test                                             |
