# Execution Learnings


## Task 0 — Install Milkdown Dependencies

- The repo already ships a `.gitmessage` template with a `document` scope, so document-related migration commits can stay consistent with existing history.

## Task 1 — Comment Decoration Plugin

- ProseMirror child positions are anchored from the parent node position, not the parent content start. Starting the recursive walk from `-1` was necessary to align character offsets with real decoration positions.

## Task 2 — Selection Capture Hook

- A tiny fake `Editor.action()` implementation was enough to unit-test the hook. The hook only depends on `editorViewCtx`, so it can stay isolated from full Milkdown bootstrapping.

## Task 3 — Crepe Editor Wrapper and Instance Hook

- The easiest reliable test seam was mocking Crepe and letting `@milkdown/react` drive lifecycle for real. That preserved the provider/useEditor contract while keeping tests fast and deterministic.

## Task 4 — MilkdownDocument and RawEditor

- The plan's discard prompt means unsaved mode switches cannot blindly carry edits across modes. Tracking draft state in the parent made that tradeoff explicit and kept both raw and WYSIWYG flows consistent.

## Task 5 — Mermaid Node View

- Milkdown `$view` plugins expose their final `NodeViewConstructor` on `.view` after initialization. Reusing `codeBlockView.view` was enough for fallback behavior; there was no need to recreate CodeMirror configuration manually.

## Task 6 — Integrate Milkdown Into DocumentView

- Deleting `SelectionPopover` required trimming its dedicated test block out of `CommentsSidebar.test.tsx`; otherwise the suite would keep importing a file that no longer exists even though the sidebar behavior itself was still valid.

## Task 7 — Styling and Dependency Cleanup

- `npm run build` emits large-chunk warnings once mermaid and the rest of Milkdown are bundled, but the build still succeeds. The warning is real, but it is a follow-up optimization concern rather than a blocker for the migration itself.

## Task 8 — Update E2E Tests

- Reusing an already-running Vite server can leave Playwright pointed at a stale dev process after large file deletions. Restarting the server before re-running the suite eliminated a blank-page false failure.

## Task 9 — Documentation Cleanup

- Large markdown edits are safer when done as a few targeted structural replacements instead of broad rewrites. The core design spec had enough duplicated terms that narrow range edits avoided collateral drift.

## Task 10 — Final Validation

- Prettier touched a wider set of `src/` files than the migration directly edited. Running the formatter once at the end was cleaner than carrying formatting drift through the final lint and format gates.
