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
