# Shareable Document Links Implementation Plan

**Goal:** Encode `repo` and `branch` as query params in hash URLs so ReDraft links are self-contained and shareable.

**Architecture:** A pure URL-parsing utility (`src/lib/url.ts`) provides router-independent param extraction. A React hook (`useShareableLink`) wraps `useSearchParams` for reactive reading and link building inside `HashRouter`. A `ShareableLinkBridge` component applies URL overrides to auth state on mount. The `overrideBranch` param is threaded through `loadBranchState` → `updateRepo` → `login` to eliminate the async race condition.

**Tech Stack:** React 18, React Router v6 (`useSearchParams`, `useLocation`), Vitest + React Testing Library, Playwright for E2E.

**Spec:** `docs/specs/2025-07-08-shareable-document-links-design.md`

---

### Task 1: URL Parsing Utility

**Files:**

- Create: `src/lib/url.ts` — pure `parseShareableParams` function, no React dependency
- Create: `src/lib/__tests__/url.test.ts` — unit tests

**Interface:**

```ts
export interface ShareableParams {
  repo: { owner: string; repo: string } | null;
  branch: string | null;
}

export function parseShareableParams(hash?: string): ShareableParams;
```

- Accepts a hash string (defaults to `window.location.hash` if omitted).
- Extracts the query-string portion after `?` in the hash fragment.
- Parses `repo` param: must contain exactly one `/` to split into `owner`/`repo`. Malformed or missing → `null`.
- Parses `branch` param: any non-empty string. Missing → `null`.
- Uses `URLSearchParams` internally.

**Behavior:**

- `parseShareableParams('#/d/spec.md?repo=acme/proj&branch=review-1')` → `{ repo: { owner: 'acme', repo: 'proj' }, branch: 'review-1' }`
- `parseShareableParams('#/d/spec.md')` → `{ repo: null, branch: null }`
- `parseShareableParams('#/d/spec.md?repo=invalid')` → `{ repo: null, branch: null }` (no `/`)
- `parseShareableParams('#/d/spec.md?repo=a/b/c')` → `{ repo: null, branch: null }` (too many segments)
- `parseShareableParams('')` → `{ repo: null, branch: null }`
- URL-encoded values must be handled (e.g. `repo=acme%2Fproj` → decoded by `URLSearchParams`).

**Checklist:**

- [x] Pure function with no side effects or React dependency
- [x] Validates `repo` format (exactly one `/`)
- [x] Handles missing, empty, and malformed inputs gracefully
- [x] Handles URL-encoded values via `URLSearchParams`

**Tests:**

- [x] Run: `npx vitest run src/lib/__tests__/url.test.ts`
- [x] Test file uses `// @vitest-environment jsdom` header. Follow pattern from `src/lib/auth/__tests__/storage.test.ts`.
- [x] Cover: both params present, only repo, only branch, no params, malformed repo (no slash, too many slashes), empty hash, no hash argument (defaults to `window.location.hash`)

**Commit:**

- [ ] Read `skill://commit`, stage files, commit: `feat(url): add parseShareableParams utility for shareable link parsing`

### Task 2: Thread `overrideBranch` Through AuthProvider

**Files:**

- Modify: `src/hooks/useAuth.ts` — add `overrideBranch` param to `loadBranchState`, `updateRepo`, and `login`
- Modify: `src/hooks/__tests__/useAuth.test.tsx` — add override tests

**Interface changes:**

`loadBranchState` (internal, not exported):

```ts
async function loadBranchState(
  pat: string,
  owner: string,
  repo: string,
  overrideBranch?: string,
): Promise<BranchState>;
```

`updateRepo` (exposed via context):

```ts
updateRepo: (owner: string, repo: string, sidecarBranch?: string, overrideBranch?: string) => void;
```

`login` (exposed via context):

```ts
login: (pat: string, owner: string, repo: string, overrideBranch?: string) =>
  Promise<void>;
```

Update `AuthContextValue` interface and `TestAuthContextValue` in tests accordingly.

**Behavior:**

In `loadBranchState`, when `overrideBranch` is provided:

1. After fetching `defaultBranch` from GitHub API, use `overrideBranch` as the branch value (instead of `getStoredBranch(owner, repo) ?? defaultBranch`).
2. Persist `overrideBranch` to localStorage via `setStoredBranch(owner, repo, overrideBranch)` so subsequent navigation stays on that branch.
3. When `overrideBranch` is absent, preserve current behavior exactly.

In `updateRepo`: forward `overrideBranch` to `loadBranchState` call on line 228.

In `login`: forward `overrideBranch` to `loadBranchState` call on line 194.

**Checklist:**

- [ ] `loadBranchState` uses `overrideBranch` when provided, ignoring localStorage
- [ ] `overrideBranch` is persisted to localStorage after being applied
- [ ] `updateRepo` and `login` forward `overrideBranch` correctly
- [ ] All existing callers (without override) continue to work unchanged
- [ ] `AuthContextValue` interface updated with new optional params

**Tests:**

- [ ] Run: `npx vitest run src/hooks/__tests__/useAuth.test.tsx`
- [ ] Update `TestAuthContextValue` to include new optional params
- [ ] Test: `updateRepo` with `overrideBranch` results in that branch being set (not the localStorage/default value)
- [ ] Test: `login` with `overrideBranch` results in that branch being set after auth
- [ ] Test: `updateRepo` without `overrideBranch` still reads from localStorage (regression)
- [ ] Test: `overrideBranch` is persisted to localStorage (verify via `getStoredBranch`)

**Commit:**

- [ ] Read `skill://commit`, stage files, commit: `feat(auth): thread overrideBranch through loadBranchState, updateRepo, login`

### Task 3: `useShareableLink` Hook + `ShareableLinkBridge` Component

**Files:**

- Create: `src/hooks/useShareableLink.ts` — reactive hook for URL params + link building
- Create: `src/components/ShareableLinkBridge.tsx` — applies URL overrides to auth state
- Modify: `src/App.tsx` — render `ShareableLinkBridge` inside `AppBody`'s `HashRouter`
- Create: `src/hooks/__tests__/useShareableLink.test.tsx` — unit tests

**Interface — `useShareableLink`:**

```ts
export interface ShareableLinkState {
  urlRepo: { owner: string; repo: string } | null;
  urlBranch: string | null;
  buildLink: (docPath?: string) => string;
  copyLink: (docPath?: string) => Promise<boolean>;
}

export function useShareableLink(): ShareableLinkState;
```

- Uses `useSearchParams()` from react-router-dom to reactively read `repo` and `branch` params.
- `urlRepo` and `urlBranch` follow the same parsing/validation as `parseShareableParams` (reuse it or replicate the logic via `useSearchParams` values).
- `buildLink(docPath?)`: uses current auth state from `useAuth()` to build `${origin}${pathname}#/d/${docPath}?repo=${owner}/${repo}&branch=${branch}`. When `docPath` is omitted, uses `#/?repo=…&branch=…`.
- `copyLink(docPath?)`: calls `buildLink`, then `navigator.clipboard.writeText`. Returns `true` on success, `false` on failure (catch clipboard errors).

**Interface — `ShareableLinkBridge`:**

A component that renders `null`. On mount (via `useEffect`):

1. Reads `urlRepo` and `urlBranch` from `useShareableLink()`.
2. Reads current `repo` and `branch` from `useAuth()`.
3. If `urlRepo` differs from current repo → calls `updateRepo(urlRepo.owner, urlRepo.repo, undefined, urlBranch ?? undefined)`.
4. Else if `urlBranch` is present and differs from current branch → calls `setBranch(urlBranch)`.
5. Must only run the override logic once on initial mount to avoid loops. Use a ref to track whether overrides have been applied.

**Wiring in `App.tsx`:**

- Import `ShareableLinkBridge`.
- Render `<ShareableLinkBridge />` inside `AppBody`, as a sibling of `<Header>` and `<Routes>` within the `<HashRouter>`.

**Behavior:**

- `buildLink` never includes PAT or any auth credential.
- `buildLink` with no current repo/branch returns just the origin + pathname + hash path (no query params).
- `copyLink` gracefully handles clipboard permission denial.
- `ShareableLinkBridge` does not trigger re-renders or re-apply overrides after initial mount.

**Checklist:**

- [ ] Hook reads URL params reactively via `useSearchParams`
- [ ] `buildLink` produces correct URL format with encoded params
- [ ] `buildLink` never includes PAT
- [ ] `copyLink` returns boolean success/failure
- [ ] Bridge applies URL overrides exactly once on mount
- [ ] Bridge calls `updateRepo` with `overrideBranch` when URL repo differs
- [ ] Bridge calls `setBranch` when only URL branch differs
- [ ] Bridge renders `null`
- [ ] `ShareableLinkBridge` added to `AppBody` in `App.tsx`

**Tests:**

- [ ] Run: `npx vitest run src/hooks/__tests__/useShareableLink.test.tsx`
- [ ] Test file uses `// @vitest-environment jsdom`. Wrap hook render in `MemoryRouter` with `initialEntries` to simulate URL params.
- [ ] Mock `useAuth` to control current repo/branch state.
- [ ] Test: `urlRepo` and `urlBranch` correctly parsed from various URL shapes
- [ ] Test: `buildLink` with doc path → correct URL with repo and branch params
- [ ] Test: `buildLink` without doc path → URL without `/d/` path segment
- [ ] Test: `copyLink` success → returns `true` (mock `navigator.clipboard.writeText`)
- [ ] Test: `copyLink` failure → returns `false` (mock clipboard to throw)

**Commit:**

- [ ] Read `skill://commit`, stage files, commit: `feat(shareable-links): add useShareableLink hook, ShareableLinkBridge, and App wiring`

### Task 4: AuthForm URL Prefill

**Files:**

- Modify: `src/components/auth/AuthForm.tsx` — prefill repo field from URL params, thread `overrideBranch` through `login`
- Create: `src/components/auth/__tests__/AuthForm.test.tsx` — unit tests

**Behavior:**

`AuthForm` renders **outside** `HashRouter`, so it cannot use `useSearchParams`. Instead:

1. On mount (or in initial state), call `parseShareableParams(window.location.hash)` from `src/lib/url.ts`.
2. If `repo` is returned, initialise the `repository` state to `"${repo.owner}/${repo.repo}"` instead of `''`.
3. Store the parsed `branch` value for use after login.
4. In `handleSubmit`, after calling `login(pat, parsed.owner, parsed.repo)`, pass the URL-specified branch as the 4th argument: `login(pat, parsed.owner, parsed.repo, urlBranch ?? undefined)`.

The user sees the repo field prefilled. They enter their PAT and click Connect. The branch override is applied during login via the `overrideBranch` mechanism from Task 2.

**Checklist:**

- [ ] Repo field prefilled from URL params on mount
- [ ] User can still edit the prefilled repo value
- [ ] URL branch is passed to `login` as `overrideBranch`
- [ ] When no URL params exist, behavior is unchanged (empty repo field, no override)
- [ ] `parseShareableParams` is imported from `src/lib/url.ts` (not `useSearchParams`)

**Tests:**

- [ ] Run: `npx vitest run src/components/auth/__tests__/AuthForm.test.tsx`
- [ ] Test file uses `// @vitest-environment jsdom`. Follow pattern from `src/components/auth/__tests__/AuthGate.test.tsx`.
- [ ] Mock `useAuth` to provide a mock `login` function. Mock `window.location.hash`.
- [ ] Test: repo field prefilled when URL has `?repo=acme/proj`
- [ ] Test: repo field empty when no URL params
- [ ] Test: `login` called with `overrideBranch` when URL has `?branch=review-1`
- [ ] Test: `login` called without `overrideBranch` when no branch in URL

**Commit:**

- [ ] Read `skill://commit`, stage files, commit: `feat(auth): prefill AuthForm repo from URL params and thread overrideBranch to login`

### Task 5: Header Copy Link Button + BranchSelector URL Sync

**Files:**

- Modify: `src/components/layout/Header.tsx` — add Copy Link button
- Modify: `src/components/tree/BranchSelector.tsx` — update URL params on branch change
- Modify: `src/components/layout/__tests__/Header.test.tsx` — add Copy Link tests

**Header — Copy Link button:**

Add a button in the right section of the header, between the rate-limit display and the Settings link. Remote mode only — hidden when `isLocalMode()` returns `true`.

- Import `useShareableLink` and `isLocalMode`.
- Extract current document path from `useLocation()`: if pathname matches `/d/*`, strip the `/d/` prefix to get the doc path.
- Default state: render a link icon (use an inline SVG or Unicode character like 🔗 — follow existing icon conventions in the project) + "Copy link" text.
- On click: call `copyLink(docPath)`. On success, change button text to "Copied ✓" for 2 seconds (use `useState` + `setTimeout`), then revert. On failure, show "Failed" briefly.
- Style: match the existing Settings link style (`rounded-md border border-slate-700 px-3 py-2 font-medium hover:border-slate-500`).

**BranchSelector — bidirectional URL sync:**

In `handleSelect`, after calling `setBranch(nextBranch)`:

- Import `useSearchParams` from react-router-dom.
- Build updated search params: set `branch` to `nextBranch`, preserve existing `repo` param.
- Change `navigate('/')` to include the updated search params in the navigation target (e.g. `navigate({ pathname: '/', search: updatedParams.toString() })`), so the params survive the navigation. The current `navigate('/')` drops all search params.
- This is best-effort — if it fails, branch selection still works via localStorage.

**Checklist:**

- [ ] Copy Link button visible in remote mode
- [ ] Copy Link button hidden in local mode
- [ ] Clicking copies a well-formed shareable URL to clipboard
- [ ] Button shows "Copied ✓" for ~2 seconds after successful copy
- [ ] Button shows "Failed" briefly on clipboard error
- [ ] URL includes doc path when on a document route
- [ ] URL omits doc path when on home/settings route
- [ ] BranchSelector updates URL `branch` param on selection
- [ ] BranchSelector preserves existing `repo` param in URL

**Tests:**

- [ ] Run: `npx vitest run src/components/layout/__tests__/Header.test.tsx`
- [ ] Mock `useShareableLink` to control `copyLink` return value. Mock `isLocalMode`.
- [ ] Test: Copy Link button renders in remote mode
- [ ] Test: Copy Link button absent in local mode
- [ ] Test: clicking Copy Link calls `copyLink` with the correct doc path
- [ ] Test: button text changes to "Copied ✓" after successful copy

**Commit:**

- [ ] Read `skill://commit`, stage files, commit: `feat(ui): add Copy Link button to Header and bidirectional URL sync in BranchSelector`

### Task 6: E2E Tests

**Files:**

- Create: `e2e/shareable-links.spec.ts` — Playwright E2E tests

**Behavior:**

These tests verify the full shareable-link flow in a real browser. Check `playwright.config.ts` and any existing `e2e/` tests for project conventions before writing.

1. **Shareable link round-trip:** Navigate to a document page. Click the Copy Link button. Verify the clipboard contains a URL with `repo` and `branch` params and the correct doc path. Navigate to that URL in a fresh browser context. After authenticating, verify the same document loads on the correct branch.

2. **Auth prefill flow:** Open a shared link (`#/d/some-doc.md?repo=owner/repo&branch=feature-1`) in an unauthenticated state. Verify the AuthForm's repository field is prefilled with `owner/repo`. Complete authentication. Verify the correct branch is loaded.

**Checklist:**

- [ ] E2E tests cover shareable link round-trip (AC-1)
- [ ] E2E tests cover auth prefill from URL params (AC-5)
- [ ] Tests verify PAT is never in the generated URL (AC-6)

**Tests:**

- [ ] Run: `npx playwright test e2e/shareable-links.spec.ts`

**Commit:**

- [ ] Read `skill://commit`, stage files, commit: `test(e2e): add Playwright tests for shareable document links`

### Task 7: Final Validation

**Checks:**

- [ ] Full test suite passes: `npx vitest run`
- [ ] Type check passes: `npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json`
- [ ] Lint passes: `npx eslint src/ server/`
- [ ] Format check passes: `npx prettier --check src/ server/`
- [ ] E2E tests pass: `npx playwright test`
- [ ] All acceptance criteria from issue #14 verified:
  - [ ] AC-1: A copied link opens the same document, repo, and branch for an authenticated recipient
  - [ ] AC-2: URL params take precedence over localStorage; localStorage remains fallback
  - [ ] AC-3: Async race in `updateRepo` handled — URL branch not clobbered by `loadBranchState`
  - [ ] AC-4: Tests cover URL param parsing, precedence, and copy-link output
  - [ ] AC-5: Unauthenticated recipient sees repo prefilled in AuthForm
  - [ ] AC-6: PAT never present in generated URLs
  - [ ] AC-7: Copy Link button hidden in local mode
- [ ] No regressions: existing auth flow, branch selection, and document navigation all work as before
