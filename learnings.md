# Execution Learnings


## Task 0 — Install Milkdown Dependencies

- The repo already ships a `.gitmessage` template with a `document` scope, so document-related migration commits can stay consistent with existing history.

## Task 1 — Comment Decoration Plugin

- ProseMirror child positions are anchored from the parent node position, not the parent content start. Starting the recursive walk from `-1` was necessary to align character offsets with real decoration positions.

## Task 2 — Selection Capture Hook

- A tiny fake `Editor.action()` implementation was enough to unit-test the hook. The hook only depends on `editorViewCtx`, so it can stay isolated from full Milkdown bootstrapping.
