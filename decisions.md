# Execution Decisions


## Task 0 — Install Milkdown Dependencies

- Added the three Milkdown core packages without removing existing markdown dependencies yet. The plan removes legacy renderer packages later, which keeps this task isolated and makes dependency regressions attributable to Milkdown installation alone.

## Task 1 — Comment Decoration Plugin

- Built a text index that records both flattened document text and character-to-position spans. This keeps quote lookup simple (`indexOf`) while preserving exact ProseMirror positions for inline decorations across marked text boundaries.
- Kept `tr.getMeta(commentPluginKey)` as the only rebuild trigger and used `DecorationSet.map` for ordinary document edits. That matches the plan and avoids recomputing every highlight on selection-only transactions.
