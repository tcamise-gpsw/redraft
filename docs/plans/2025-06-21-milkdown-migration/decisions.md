# Execution Decisions


## Task 0 — Install Milkdown Dependencies

- Added the three Milkdown core packages without removing existing markdown dependencies yet. The plan removes legacy renderer packages later, which keeps this task isolated and makes dependency regressions attributable to Milkdown installation alone.

## Task 1 — Comment Decoration Plugin

- Built a text index that records both flattened document text and character-to-position spans. This keeps quote lookup simple (`indexOf`) while preserving exact ProseMirror positions for inline decorations across marked text boundaries.
- Kept `tr.getMeta(commentPluginKey)` as the only rebuild trigger and used `DecorationSet.map` for ordinary document edits. That matches the plan and avoids recomputing every highlight on selection-only transactions.

## Task 2 — Selection Capture Hook

- Kept selection capture view-local by listening on `view.dom` instead of document-level events. That avoids cross-editor bleed and makes cleanup deterministic when the Milkdown instance mounts or unmounts.
- Read the ProseMirror selection and document text directly through `editor.action(...editorViewCtx)`. This preserves exact editor state without depending on DOM selection normalization.

## Task 3 — Crepe Editor Wrapper and Instance Hook

- Kept the Crepe instance stable by giving `useEditor` an empty dependency list and moving mutable behavior into effects. `readOnly`, comment updates, and external view-mode content sync now update the existing instance instead of recreating the editor.
- Registered the comment plugin and markdown listener during Crepe construction, before React's Milkdown wrapper calls `create()`. That guarantees decorations and change notifications exist from the first render.
- Added a forwarded `CrepeEditorHandle` with `getMarkdown()` so later document-mode controls can save from the live editor without coupling to Milkdown internals.

## Task 4 — MilkdownDocument and RawEditor

- Kept one shared `baselineContent` and `draftContent` in `MilkdownDocument` so mode switches, save flows, and discard prompts all reason about the same markdown source of truth.
- Extended `RawEditor` with an optional `onChange` callback. That lets the parent enforce cross-mode dirty-state prompts without changing the textarea-focused save/cancel behavior that already existed in `MarkdownEditor`.
- Handled selection confirmation in `MilkdownDocument` instead of a separate global popover component. The document now owns both the captured selection payload and the viewport positioning needed to place the inline comment button.

## Task 5 — Mermaid Node View

- Reused Milkdown's existing code block node view for non-mermaid languages and overrode only the `mermaid` language case. That keeps standard code blocks on the established CodeMirror path instead of introducing a second generic renderer.
- Rendered diagrams asynchronously inside a dedicated node view and guarded updates with a render token. That prevents stale async mermaid results from overwriting newer node content.
- Registered the mermaid node view from `useCrepeInstance` alongside the comment plugin so the editor is fully configured before React triggers Milkdown creation.

## Task 6 — Integrate Milkdown Into DocumentView

- Moved save orchestration into `DocumentView` and kept `useProposalEdit` as the single write boundary. `MilkdownDocument` only knows how to emit markdown; GitHub writes and query invalidation still live in the hook designed for them.
- Treated `/edit` as a compatibility suffix in `ProposalView` instead of preserving a separate route. That keeps old deep links working while collapsing editing back into the main proposal surface.
- Rewrote the document and proposal-view tests around the new component seams before removing the legacy files. This kept route compatibility and comment-sidebar interactions covered while the old renderer/editor files were deleted.

## Task 7 — Styling and Dependency Cleanup

- Kept the theme work in `src/index.css` and limited it to CSS variables plus a few explicit selectors. That integrates with Crepe's shipped styles without introducing another styling layer or component-local overrides everywhere.
- Removed the legacy markdown-rendering packages only after the old renderer, editor, and selection components were deleted. That kept dependency cleanup tightly coupled to actual source removal and made `tsc` a reliable check for missed imports.

## Task 8 — Update E2E Tests

- Kept the Playwright suite GitHub-API mocked and updated the assertions to target the new Milkdown surface instead of the removed `/edit` route and renderer DOM. That preserved deterministic end-to-end coverage while matching the new UI contract.
- Tested comment creation through real DOM selection inside `.ProseMirror` rather than bypassing the UI. This keeps the browser test aligned with the ProseMirror-based selection flow that replaced the old global selection popover.
- Used raw mode for persistence/conflict coverage and WYSIWYG mode for editability/mode-switch coverage. That split keeps the suite stable while still exercising both editing surfaces end to end.

## Task 9 — Documentation Cleanup

- Updated only the docs named in the plan and cleaned every stale reference to the removed markdown renderer/editor stack within those files. That keeps the migration documentation accurate without reopening unrelated historical plans or notes.
- Documented `/proposals/:path` as the single active proposal route and treated `/edit` as compatibility behavior in implementation, not as a first-class route in the architecture docs.

## Task 10 — Final Validation

- Ran the full project gates from `AGENTS.md` after the migration landed: Vitest, TypeScript, ESLint, Prettier check, Vite build, and Playwright. The migration is only treated as complete once all of them pass together on the final tree.
