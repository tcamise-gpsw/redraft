# Comment Anchor Redesign

Supersedes the **Anchor Reconciliation** section of `docs/specs/2025-06-21-proposal-review-core-design.md` (lines 203–210) and extends the comment data model defined there.

## Problem

Adding or loading comments on a real-world document (tens of KB) freezes the browser tab, making ReDraft unusable for the repositories it was built to serve.

**Root cause 1 — Super-quadratic fuzzy matcher.** `findFuzzyCandidate` in `src/lib/comments/anchoring.ts` scans every start offset in the document (`O(N)`) across a range of candidate lengths (`~O(quoteLen)`), calling a `similarity` function that builds two full DP tables each `O(candidate × quote)` with per-iteration array allocation. Net complexity ≈ `O(N × quoteLen³)`. Measured wall-clock time on a single `resolveAnchor` call:

| Document size | Time (one comment) |
| ------------- | ------------------ |
| 1 KB          | ~0.9 s             |
| 3 KB          | ~2.8 s             |
| 8 KB          | ~8 s               |

This runs synchronously inside `CommentsSidebar`'s `useMemo` for every comment on every render.

**Root cause 2 — Representation mismatch triggers the fuzzy path constantly.** Quotes are captured from Milkdown's rendered text via `doc.textBetween(from, to, ' ')` in `selectionCapture.ts`, which strips markdown syntax and collapses block separators. The sidebar resolves them against the raw markdown source (`ProposalView.tsx` passes `documentText={content}` from `useDocument`). Any selection touching formatting, headings, or block boundaries produces zero exact occurrences in the raw markdown, falling through directly to the fuzzy bomb.

**Root cause 3 — Test gap.** Unit tests use 50–100 character documents. E2E tests use small docs with quotes that exact-match the raw markdown. The expensive fuzzy branch has never executed under load in any test.

## Design Decisions

| Decision           | Choice                                                   | Rationale                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuzzy tier         | **Remove entirely**                                      | Confluence-style graceful orphaning. No tool does whole-doc brute-force fuzzy (Hypothesis uses position-hinted Bitap; Confluence refuses text re-scan entirely). Fuzzy can be re-added later behind a bounded algorithm if orphaning proves too aggressive. |
| Resolve text space | **Rendered text** (ProseMirror `textBetween`)            | Quotes are captured in rendered space; resolving in the same space makes exact/context match reliable. The comment highlight plugin (`commentPlugin.ts`) already indexes in rendered space via `text.indexOf(quote)`.                                       |
| Position hint      | **Store char offset in rendered-text space** per comment | Cheap `O(1)` verify-first strategy, per W3C `TextPositionSelector` / Hypothesis design. Optional field — existing sidecars without it degrade to exact/context.                                                                                             |
| New dependency     | **None**                                                 | No `diff-match-patch` or other library needed.                                                                                                                                                                                                              |
| Test fixtures      | **Seed submodule with large real-world doc**             | The test gap exists because fixtures are toy-sized. A ~20–40 KB doc with headings, bold, links, code fences, and tables catches this class of issue.                                                                                                        |

## Architecture

### 1. Anchoring core — `src/lib/comments/anchoring.ts`

**Delete:** `longestCommonSubstring`, `longestCommonSubsequenceLength`, `similarity`, `findFuzzyCandidate`, and the dead `createAnchor` (only tests reference it; runtime selection capture builds quote/context directly in `selectionCapture.ts`).

**`resolveAnchor(documentText, anchor)` — new resolution order:**

1. **Offset hint** — if `anchor.offset` is a number, verify `documentText.slice(offset, offset + quote.length) === quote`. If match → `{ status: 'exact', startIndex: offset, ... }`. Cost: `O(quoteLen)`.
2. **Exact** — `findExactOccurrences` via `indexOf` (unchanged). Multiple hits → rank by `scoreContext` (unchanged). Single hit → `exact` or `context` (unchanged). Cost: `O(N)`.
3. **Context-only relocation** — when 0 exact occurrences and prefix/suffix are available: `indexOf` the normalized prefix across the whole doc. If found, `indexOf` the normalized suffix after it. Extract the span between; if it equals the quote (normalized) → `{ status: 'context', ... }`. This finds text wherever it relocated. Cost: `O(N)`.
4. **Orphaned** — return `orphaned()`.

**`AnchorResult.status`** values reduce to `'exact' | 'context' | 'orphaned'`. The `'fuzzy'` status is removed; all consumers updated.

**`AnchorInput`** gains `offset?: number`.

### 2. Data model — `src/types/comments.ts`

```typescript
interface CommentThread {
  id: string;
  quote: string;
  quoteContext: { prefix: string; suffix: string };
  offset: number; // NEW — char offset in rendered-text space
  author: { login: string; avatarUrl: string };
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
}
```

`offset` is required. There are no existing users, so no back-compat concern. Existing test fixture sidecars must be updated to include the field.

### 3. Rendered text as the resolve space

**Capture offset:** In `selectionCapture.ts`, compute `offset = doc.textBetween(0, selection.from, ' ').length` and include it in the emitted `TextSelection`. Wire through `MilkdownDocument` → `DocumentView` → `ProposalView` `pendingSelection` → `CommentsSidebar` `addComment`.

**Sidebar resolves against rendered text:** Add a callback from the Crepe editor instance (via `useCrepeInstance` or a new `onRenderedText` prop) that emits `view.state.doc.textBetween(0, doc.content.size, ' ')` whenever the document content changes. `ProposalView` holds this in state and passes it as `documentText` to `CommentsSidebar` instead of the raw markdown `content`. Before the editor mounts (initial server render), `documentText` falls back to the raw `content` — acceptable because no comments are visible yet at that point.

This unifies the text space: quote capture, highlight decoration (`commentPlugin.ts`), and sidebar resolution all operate on the same rendered-text representation.

### 4. Test-fixtures submodule — `tcamise-gpsw/redraft-test-repo`

- Add a **realistically large** markdown document (target ~20–40 KB): multiple H1–H4 headings, bold/italic, links, inline code, fenced code blocks, lists, tables. Representative of katalyst-scale documents.
- Seed `.redraft/comments/<branch>/` sidecars for it with quotes captured in rendered space. Include comments that exact-match, at least one that has been relocated (tests context-relocation), and at least one whose text was deleted (tests orphaning).
- Include `offset` hints on the seeded comments.
- Keep existing small fixtures unchanged for current unit/E2E tests.
- Bump the submodule pointer in the main repo after pushing.

### 5. Tests

**Unit — `src/lib/comments/__tests__/anchoring.test.ts`:**

- Rewrite for the new tiers: offset hit, offset miss (falls to exact), exact single/multiple, context relocation (text moved far from original offset), orphaned (quote + context both gone).
- Remove all fuzzy-specific tests (`longestCommonSubstring`, `similarity`, `findFuzzyCandidate`).
- **Large-document performance budget test:** construct a ~50 KB document and a non-matching quote. Assert `resolveAnchor` completes well under 50 ms. This test fails hard on the current brute-force code (~8 s at 8 KB) and passes trivially on the new `O(N)` implementation.

**Local E2E — `e2e/comment-perf.spec.ts` (`--project=local`):**

- Start the local server pointed at the fixtures repo.
- Open the large fixture document.
- Assert the sidebar renders with seeded comments within a time budget (today it would hang).
- Add a new comment via text selection, save, and verify the sidecar is written on disk.
- Verify at least one seeded comment anchors correctly and at least one appears in the Orphaned section.

**Existing tests:**

- Update `src/lib/comments/__tests__/positioning.test.ts` and any other consumers of `status: 'fuzzy'`.
- Remote Playwright suite (`--project=remote`) runs unchanged as a regression gate.

### 6. Skill update — `.agents/skills/e2e-browser-testing`

Add the large-fixture scenario to the local-mode checklist so this class of performance regression is a standard check going forward.

### 7. Spec cross-reference

Update the **Anchor Reconciliation** section of `docs/specs/2025-06-21-proposal-review-core-design.md` to reference this spec as the current design.

## Files

| Action  | Path                                                                   | Change                                                                  |
| ------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Modify  | `src/lib/comments/anchoring.ts`                                        | Rewrite: delete fuzzy/LCS/similarity/createAnchor, new resolution order |
| Modify  | `src/lib/comments/index.ts`                                            | Drop `createAnchor` export                                              |
| Modify  | `src/types/comments.ts`                                                | Add optional `offset` to `CommentThread`                                |
| Modify  | `src/hooks/useComments.ts`                                             | Thread `offset` through `addComment`                                    |
| Modify  | `src/components/document/milkdown/selectionCapture.ts`                 | Compute and emit `offset`                                               |
| Modify  | `src/components/document/milkdown/useCrepeInstance.ts`                 | Emit rendered doc text                                                  |
| Modify  | `src/components/document/milkdown/CrepeEditor.tsx`                     | Accept + wire `onRenderedText`                                          |
| Modify  | `src/components/document/MilkdownDocument.tsx`                         | Accept + wire `onRenderedText`                                          |
| Modify  | `src/components/document/DocumentView.tsx`                             | Accept + wire `onRenderedText`                                          |
| Modify  | `src/routes/ProposalView.tsx`                                          | Hold rendered text state, pass to sidebar                               |
| Modify  | `src/components/comments/CommentsSidebar.tsx`                          | Consume rendered text                                                   |
| Rewrite | `src/lib/comments/__tests__/anchoring.test.ts`                         | New tiers + perf budget test                                            |
| Modify  | `src/lib/comments/__tests__/positioning.test.ts`                       | Remove `'fuzzy'` status refs                                            |
| Modify  | `src/components/document/milkdown/__tests__/selectionCapture.test.tsx` | Assert `offset` emitted                                                 |
| Create  | `e2e/comment-perf.spec.ts`                                             | Local E2E with time budget                                              |
| Modify  | `test-fixtures/` (submodule)                                           | Large doc + sidecars                                                    |
| Modify  | `.agents/skills/e2e-browser-testing/SKILL.md`                          | Add large-fixture checklist item                                        |
| Modify  | `docs/specs/2025-06-21-proposal-review-core-design.md`                 | Cross-reference this spec                                               |

## Acceptance Criteria

1. Adding or loading comments on a ~40 KB document keeps the UI responsive (no multi-second main-thread block); verified by the local E2E budget test.
2. `resolveAnchor` has no code path with worse than `O(N)` complexity; unit budget test enforces this.
3. Comments whose quote still exists in the document (even if relocated) anchor via offset/exact/context tiers.
4. Comments whose quote and context are both gone appear in the **Orphaned** section without crashing or freezing.
5. All existing test fixture sidecars updated to include the `offset` field.
6. All existing Playwright remote-mode tests pass unchanged.
7. `npx vitest run`, `npx tsc --noEmit`, `npx eslint src/ server/`, and `npx prettier --check src/ server/` all pass.

## Verification Commands

```
npx vitest run src/lib/comments src/hooks src/components/document
npx playwright test --project=local e2e/comment-perf.spec.ts
npx playwright test --project=remote
npx tsc --noEmit && npx tsc --noEmit -p server/tsconfig.json
npx eslint src/ server/
npx prettier --check src/ server/
```

## Out of Scope

- **ProseMirror comment marks** — Marks move with in-app edits automatically, but ReDraft documents are also edited externally as raw `.md` on GitHub. Marks can't persist in plain markdown without polluting the file, and can't track external edits. Noted as a future enhancement for the in-app editing path only.
- **Bounded fuzzy re-anchoring (diff-match-patch / Bitap)** — Can be re-introduced later behind the same `resolveAnchor` tiers if Confluence-style orphaning proves too aggressive in practice. The architecture supports adding a tier between context and orphaned without breaking changes.
