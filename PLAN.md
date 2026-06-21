# Milkdown Migration Implementation Plan

**Goal:** Replace `react-markdown` + `<textarea>` with Milkdown Crepe for unified read-only rendering, WYSIWYG editing, and raw markdown editing with ProseMirror-native comment decorations and text selection.

**Architecture:** A `MilkdownDocument` component wraps a Milkdown Crepe editor with three modes (View/WYSIWYG/Raw). Comment highlights are ProseMirror `DecorationSet` inline decorations managed by a custom plugin. Text selection fires from `EditorView.state.selection` via a mouseup hook. Mermaid code blocks render as SVG via a custom node view.

**Tech Stack:** Milkdown Crepe (`@milkdown/crepe`, `@milkdown/react`, `@milkdown/kit`), ProseMirror (decorations, plugins, node views), mermaid (diagram rendering), React 19, TypeScript strict, Vite, Tailwind CSS.

**Spec:** `docs/specs/2025-06-21-milkdown-migration-design.md`

---


### Task 0: Install Milkdown Dependencies

**Files:**
- Modify: `package.json` — Add `@milkdown/crepe`, `@milkdown/react`, `@milkdown/kit` to dependencies

**Behavior:**
- Run `npm install @milkdown/crepe @milkdown/react @milkdown/kit` to add the three core packages
- Verify install succeeded: `npx tsc --noEmit` should still pass (no code uses them yet, but they should resolve)

**Checklist:**
- [x] `@milkdown/crepe`, `@milkdown/react`, `@milkdown/kit` appear in `package.json` dependencies
- [x] `package-lock.json` updated
- [x] `npx tsc --noEmit` passes (no regressions from adding packages)

**Commit:**
- [x] Read `skill://conventional-commit`, stage, commit

---

### Task 1: Comment Decoration Plugin

**Files:**
- Create: `src/components/document/milkdown/commentPlugin.ts` — ProseMirror plugin that manages comment highlight decorations

**Interface:**
```typescript
export interface CommentHighlight {
  id: string;
  quote: string;
}

export const commentPluginKey: PluginKey<DecorationSet>;

export function makeCommentPlugin(
  initialComments: CommentHighlight[],
  onSelectComment: (id: string) => void,
): Plugin<DecorationSet>;
```

**Behavior:**
- `state.init`: Flattens the ProseMirror doc to a plain-text string via `doc.textBetween(0, doc.content.size, '\n', '\0')`. For each comment's `quote`, finds its char offset in the flat string, then converts char offsets to ProseMirror positions by walking `doc.descendants()` with a running character counter. Creates `Decoration.inline(from, to, { class: 'milkdown-comment-highlight', 'data-comment-id': id })`.
- `state.apply`: If `tr.getMeta(commentPluginKey)` contains a new `CommentHighlight[]`, fully rebuilds the `DecorationSet`. Otherwise, if `tr.docChanged`, maps the existing set via `decos.map(tr.mapping, tr.doc)`.
- `props.decorations`: Returns the `DecorationSet` from plugin state.
- `props.handleClick`: Checks `(event.target as HTMLElement).closest('[data-comment-id]')`. If found, calls `onSelectComment(id)` and returns `true` (consumed).
- Edge cases: Empty quotes are skipped. Quotes not found in the document produce no decoration (no error). Multiple occurrences of the same quote text produce decorations only for the first match.

**Checklist:**
- [x] Multi-node text search implemented (flat string → char offset → ProseMirror pos)
- [x] Decorations rebuild on meta-transaction without editor remount
- [x] Decorations map through edits (position drift handled)
- [x] Click on decoration fires `onSelectComment(id)`
- [x] Empty/missing quotes produce no decorations (no crash)

**Tests:**
- [x] Run `npx vitest run src/components/document/milkdown/commentPlugin` to verify
- [x] Test: single-node quote produces correct decoration positions
- [x] Test: quote spanning bold/link boundary (multi-node) produces correct positions
- [x] Test: quote not found in doc produces empty decoration set
- [x] Test: `setMeta` with new comments rebuilds decorations
- [x] Test: `tr.mapping` shifts decoration positions after text insert

**Commit:**
- [x] Read `skill://conventional-commit`, stage, commit


---

### Task 2: Selection Capture Hook

**Files:**
- Create: `src/components/document/milkdown/selectionCapture.ts` — Hook that captures text selection from ProseMirror state

**Interface:**
```typescript
export interface TextSelection {
  quote: string;
  context: { prefix: string; suffix: string };
  /** Viewport pixel coords for popover positioning (from view.coordsAtPos) */
  coords: { left: number; top: number; bottom: number };
}

export function useSelectionCapture(
  editorGetter: () => Editor | undefined,
  loading: boolean,
  onTextSelect: ((selection: TextSelection) => void) | undefined,
): void;
```

**Behavior:**
- Attaches a `mouseup` event listener to `view.dom` (obtained via `ctx.get(editorViewCtx)`)
- On mouseup: reads `view.state.selection`. If `selection.empty`, no-op.
- Extracts quote via `doc.textBetween(from, to, ' ')`, trims whitespace
- If quote is empty after trim, no-op
- Extracts prefix: `doc.textBetween(max(0, from - 100), from, ' ')`
- Extracts suffix: `doc.textBetween(to, min(doc.content.size, to + 100), ' ')`
- Computes viewport coordinates via `view.coordsAtPos(from)` for popover positioning
- Calls `onTextSelect({ quote, context: { prefix, suffix }, coords: { left, top, bottom } })`
- Uses a `useRef` for the callback to avoid stale closures without re-attaching the listener
- Cleans up the event listener on unmount or when `loading` transitions

**Checklist:**
- [x] Selection captured from ProseMirror state, not `window.getSelection()`
- [x] Prefix/suffix bounded to 100 chars from doc boundaries
- [x] Empty selections (collapsed cursor) produce no callback
- [x] Callback ref pattern prevents stale closures
- [x] Listener cleaned up on unmount

**Tests:**
- [x] Run `npx vitest run src/components/document/milkdown/selectionCapture` to verify
- [x] Test: non-empty selection fires `onTextSelect` with correct quote and context
- [x] Test: empty selection (from === to) does not fire
- [x] Test: selection at doc start has empty prefix
- [x] Test: selection at doc end has empty suffix

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 3: Crepe Editor Wrapper & Instance Hook

**Files:**
- Create: `src/components/document/milkdown/CrepeEditor.tsx` — React component wrapping Crepe with MilkdownProvider
- Create: `src/components/document/milkdown/useCrepeInstance.ts` — Hook composing comment plugin registration + selection capture + comment live updates

**Interface:**
```typescript
// CrepeEditor.tsx
interface CrepeEditorProps {
  content: string;
  readOnly: boolean;
  comments: CommentHighlight[];
  onTextSelect?: (selection: TextSelection) => void;
  onSelectComment?: (id: string) => void;
  onMarkdownChange?: (markdown: string) => void;
}

// useCrepeInstance.ts
interface UseCrepeInstanceOptions {
  content: string;
  comments: CommentHighlight[];
  onTextSelect?: (selection: TextSelection) => void;
  onSelectComment?: (id: string) => void;
  onMarkdownChange?: (markdown: string) => void;
  readOnly: boolean;
}

export function useCrepeInstance(options: UseCrepeInstanceOptions): {
  editorReturn: UseEditorReturn;
  crepeRef: React.RefObject<Crepe | null>;
  getMarkdown: () => string;
};
```

**Behavior:**

`useCrepeInstance`:
- Calls `useEditor((root) => { ... })` to create a Crepe instance
- Before `crepe.create()`: registers `commentPlugin` via `crepe.editor.use($prose(() => makeCommentPlugin(...)))`
- Registers the `markdownUpdated` listener via `crepe.on(api => api.markdownUpdated(...))`
- Stores the Crepe instance in a ref for imperative access (`getMarkdown()`)
- Calls `useSelectionCapture` with the editor getter and loading state
- Dispatches comment updates via `view.state.tr.setMeta(commentPluginKey, comments)` in a `useEffect([comments])`
- Calls `crepe.setReadonly(readOnly)` in a `useEffect([readOnly])` to toggle mode without remount
- **Content sync**: In a `useEffect([content, readOnly])`, when `readOnly === true` (View mode) and `content` prop differs from current editor content, calls `editor.action(replaceAll(content))` to update the rendered doc without remounting. In WYSIWYG/Raw modes, external content updates are ignored (user is editing).

`CrepeEditor`:
- Wraps `MilkdownProvider` → inner component using `useCrepeInstance`
- Renders `<div className="milkdown-document-wrapper"><Milkdown /></div>`
- Imports Crepe theme CSS: `@milkdown/crepe/theme/common/style.css` and `@milkdown/crepe/theme/frame-dark.css`

**Checklist:**
- [ ] Single Crepe instance shared between View and WYSIWYG modes (toggle via `setReadonly`)
- [ ] Comment plugin registered before creation
- [ ] Live comment updates via setMeta dispatch
- [ ] Selection capture wired to mouseup hook
- [ ] `getMarkdown()` returns current editor content synchronously
- [ ] `onMarkdownChange` fires on every edit in WYSIWYG mode
- [ ] Crepe theme CSS imported correctly
- [ ] Error boundary wraps Crepe: on init failure, renders `<pre>` with raw markdown + error banner
- [ ] Content sync: `replaceAll` fires when `content` prop changes in View mode

**Tests:**
- [ ] Run `npx vitest run src/components/document/milkdown/CrepeEditor` to verify
- [ ] Test: renders without error with minimal content prop
- [ ] Test: `readOnly=true` renders non-editable content
- [ ] Test: toggling readOnly does not remount (check that editor instance ref is stable)

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 4: MilkdownDocument Component & RawEditor

**Files:**
- Create: `src/components/document/MilkdownDocument.tsx` — Main component with mode toggle (View/WYSIWYG/Raw)
- Create: `src/components/document/RawEditor.tsx` — Textarea editor extracted from current `MarkdownEditor.tsx`

**Interface:**
```typescript
// MilkdownDocument.tsx
interface MilkdownDocumentProps {
  content: string;
  onSave: (markdown: string) => Promise<void>;
  isSaving?: boolean;
  comments: CommentHighlight[];
  onTextSelect: (selection: TextSelection) => void;
  onSelectComment: (id: string) => void;
}

type Mode = 'view' | 'wysiwyg' | 'raw';
```

**Behavior:**

`MilkdownDocument`:
- Renders a mode toggle bar at the top with three pill buttons: View | WYSIWYG | Raw
- Default mode is `view`
- In `view` and `wysiwyg` modes: renders `CrepeEditor` with `readOnly` set accordingly
- In `raw` mode: unmounts `CrepeEditor`, mounts `RawEditor` with current markdown
- When switching from `wysiwyg` → another mode: if content has changed, shows `window.confirm('You have unsaved changes. Discard?')`. If declined, stays in wysiwyg.
- When switching from `raw` → another mode: same unsaved-changes guard
- In `wysiwyg` mode: shows a "Save" button; onClick calls `crepeRef.getMarkdown()` → `onSave`
- In `view` mode: no Save button shown
- Selection popover UI: When `onTextSelect` fires (from `CrepeEditor`'s `mouseup` hook), shows a floating "Comment" button positioned via `view.coordsAtPos(from)`. Clicking the button confirms the selection for the parent. This replaces the external `SelectionPopover` component.
- All comments/selection callbacks passed through to `CrepeEditor`

`RawEditor`:
- Extracted from current `MarkdownEditor.tsx` behavior (same textarea with tab-insert, char/line count)
- Props: `{ initialContent: string; onSave: (content: string) => Promise<void>; onCancel: () => void; isSaving: boolean }`
- `onCancel` switches back to View mode (parent handles this)

**Checklist:**
- [ ] Three mode tabs render correctly
- [ ] View mode shows read-only rendered markdown
- [ ] WYSIWYG mode shows editable Crepe with Save button
- [ ] Raw mode shows textarea with Save/Cancel buttons
- [ ] Mode switching preserves latest content (no data loss between modes)
- [ ] Unsaved-changes confirmation on mode switch with dirty state
- [ ] Selection popover positioned via ProseMirror coords (replaces external `SelectionPopover`)

**Tests:**
- [ ] Run `npx vitest run src/components/document/MilkdownDocument` to verify
- [ ] Test: mode toggle switches between view/wysiwyg/raw
- [ ] Test: Save in WYSIWYG mode calls onSave with markdown
- [ ] Test: Save in Raw mode calls onSave with textarea content
- [ ] Test: unsaved-changes guard fires confirm dialog on mode switch

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 5: Mermaid Node View

**Files:**
- Create: `src/components/document/milkdown/mermaidNodeView.tsx` — Custom node view for mermaid code blocks
- Modify: `src/components/document/milkdown/CrepeEditor.tsx` — Register mermaid node view
- Modify: `package.json` — Add `mermaid` dependency

**Interface:**
```typescript
// Returns the $view plugin to register on the Crepe editor
export function mermaidNodeViewPlugin(): MilkdownPlugin;
```

**Behavior:**
- Registered via Milkdown's `$view()` utility on the `code_block` node schema
- Activates only when `node.attrs.language === 'mermaid'`; all other code blocks use Crepe's default CodeMirror rendering
- **Rendering**: Creates a container div, calls `mermaid.render(uniqueId, node.textContent)` to produce SVG, inserts the SVG into the container
- **Both View and WYSIWYG modes**: Shows rendered diagram only (code is not editable inline — user must switch to Raw mode)
- **Error handling**: If `mermaid.render()` throws (syntax error), renders the raw code in a `<pre>` block with a red border and error message below
- **Updates**: When the node's text content changes (e.g., external content refresh), re-renders the diagram
- `mermaid.initialize()` called once with `{ startOnLoad: false, theme: 'dark' }` at module level

**Checklist:**
- [ ] `mermaid` package added to `dependencies` in `package.json`
- [ ] Mermaid code blocks render as SVG diagrams
- [ ] Invalid mermaid syntax shows error state (not blank, not crash)
- [ ] Non-mermaid code blocks unaffected (still use CodeMirror)
- [ ] Dark theme mermaid diagrams (readable on slate-900 background)
- [ ] Node view registered in CrepeEditor before `.create()`

**Tests:**
- [ ] Run `npx vitest run src/components/document/milkdown/mermaidNodeView` to verify
- [ ] Test: valid mermaid code produces SVG content in the DOM
- [ ] Test: invalid mermaid code shows error indicator
- [ ] Test: non-mermaid code blocks are not intercepted

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 6: Integration — Wire into DocumentView & Remove Edit Route

**Files:**
- Modify: `src/components/document/DocumentView.tsx` — Replace `MarkdownRenderer` + `SelectionPopover` with `MilkdownDocument`; wire save via `useProposalEdit`
- Modify: `src/routes/ProposalView.tsx` — Pass `sha` to `DocumentView` for save support
- Modify: `src/App.tsx` — Remove the `/edit` route branch from `ProposalRoute`; simplify to always render `ProposalView`
- Delete: `src/routes/ProposalEdit.tsx` — No longer needed
- Delete: `src/components/document/MarkdownRenderer.tsx` — Replaced by MilkdownDocument
- Delete: `src/components/document/MarkdownEditor.tsx` — Replaced by RawEditor in MilkdownDocument
- Delete: `src/components/comments/SelectionPopover.tsx` — Replaced by inline popover in MilkdownDocument
- Delete: `src/lib/markdown/index.ts` — DOM helpers no longer needed (ProseMirror handles text extraction)
- Delete: `src/components/document/__tests__/MarkdownEditor.test.tsx` — Replaced by MilkdownDocument tests
- Delete: `src/components/document/__tests__/DocumentView.test.tsx` — Will be rewritten for new structure

**Behavior:**

`DocumentView` changes:
- Imports `MilkdownDocument` instead of `MarkdownRenderer`
- Imports `useProposalEdit` for save capability
- Adds `sha` to its destructured `useProposal` result
- Removes the "Edit" link (editing is now via mode toggle)
- Removes `SelectionPopover` (built into MilkdownDocument)
- Passes `onSave` that calls `useProposalEdit.save(content, sha)` with loading state management
- Passes `isSaving` state to `MilkdownDocument`

`ProposalView` changes:
- Minimal — `DocumentView` now handles save internally; the route just passes `path`

`App.tsx` changes:
- `ProposalRoute` no longer checks for `/edit` suffix — always renders `ProposalView`
- Remove `ProposalEdit` import

**Checklist:**
- [ ] `MarkdownRenderer`, `MarkdownEditor`, `SelectionPopover`, `ProposalEdit` all deleted
- [ ] `DocumentView` renders `MilkdownDocument` with all props wired
- [ ] Save works: WYSIWYG/Raw → Save → commits to GitHub via `useProposalEdit`
- [ ] No broken imports anywhere in the app
- [ ] `/proposals/:path/edit` URL now just shows the view (no crash, graceful)
- [ ] Comment creation flow: select text → popover appears → click → sidebar opens form

**Tests:**
- [ ] Run `npx vitest run` to verify nothing is broken
- [ ] Run `npx tsc --noEmit` to verify no type errors from deleted files

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 7: Styling — Crepe Dark Theme & Comment Highlights

**Files:**
- Modify: `src/index.css` — Add Crepe dark theme overrides and comment highlight styles
- Modify: `package.json` — Remove `react-markdown`, `rehype-highlight`, `rehype-raw`, `remark-gfm` from dependencies

**Behavior:**

CSS additions to `src/index.css`:
- `.milkdown-document-wrapper .milkdown` — Override Crepe CSS variables for transparent background integration with the slate-900 app surface: `--crepe-color-background: transparent`, `--crepe-color-surface: rgb(15 23 42)`, `--crepe-color-on-background: rgb(241 245 249)`, `--crepe-color-border: rgb(30 41 59)`
- `.milkdown-comment-highlight` — Amber highlight: `background-color: rgb(251 191 36 / 0.2)`, `border-bottom: 2px solid rgb(251 191 36)`, `cursor: pointer`, `border-radius: 2px`, `transition: background-color 150ms`
- `.milkdown-comment-highlight:hover` — Darker amber on hover: `background-color: rgb(251 191 36 / 0.35)`
- `.milkdown-document-wrapper .crepe-toolbar` — Ensure toolbar blends with dark theme (if needed based on visual testing)

Dependency removal:
- Remove `react-markdown`, `rehype-highlight`, `rehype-raw`, `remark-gfm` from `package.json` `dependencies`
- Run `npm install` to update lockfile

**Checklist:**
- [ ] Crepe renders with transparent background on slate-900 containers
- [ ] Text is readable (slate-100 on dark background)
- [ ] Comment highlights are visible amber with hover state
- [ ] Old dependencies removed from package.json
- [ ] `package-lock.json` updated via `npm install`
- [ ] No visual conflicts between Crepe CSS and Tailwind

**Tests:**
- [ ] Run `npm run build` to verify no missing CSS imports
- [ ] Run `npx tsc --noEmit` to verify no imports of removed packages

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 8: Update E2E Tests

**Files:**
- Modify: `e2e/proposals.spec.ts` — Update selectors and assertions for Milkdown-rendered content
- Modify: `e2e/comments.spec.ts` — Update text selection flow (now uses ProseMirror selection, popover is inside MilkdownDocument)
- Modify: `e2e/editing.spec.ts` — Replace textarea editing assertions with WYSIWYG and Raw mode toggle flows
- Delete: any references to `/edit` route in E2E specs

**Behavior:**

`proposals.spec.ts`:
- Verify proposal content renders inside `.milkdown-document-wrapper` (not `ReactMarkdown`)
- Verify headings, code blocks, lists, tables appear correctly
- Verify mermaid diagrams render as SVG

`comments.spec.ts`:
- Select text inside the Milkdown editor (via mouse actions on `.milkdown` container)
- Verify the inline comment popover appears (positioned above selection)
- Click popover → verify comment form opens in sidebar
- Verify existing comment highlights are visible (`.milkdown-comment-highlight` elements)
- Click a highlight → verify sidebar scrolls to that comment

`editing.spec.ts`:
- Click WYSIWYG tab → verify editor becomes editable (contenteditable=true)
- Type text → verify it appears in editor
- Click Save → verify content persists (re-load shows the change)
- Click Raw tab → verify textarea appears with markdown source
- Edit in textarea → Save → verify persists
- Mode toggle: View → WYSIWYG → Raw → View (no crashes, content preserved)

**Checklist:**
- [ ] All E2E specs pass with the new Milkdown-based rendering
- [ ] No references to old `MarkdownRenderer` or `/edit` route remain
- [ ] Comment creation flow tested end-to-end
- [ ] Mode switching tested end-to-end

**Tests:**
- [ ] Run `npx playwright test` to verify all E2E specs pass

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 9: Documentation & Cleanup

**Files:**
- Modify: `AGENTS.md` — Update component structure to reflect new file layout; update "Markdown" entry in tech stack
- Modify: `docs/architecture.md` — Update architecture description to reference Milkdown instead of react-markdown
- Modify: `docs/specs/2025-06-21-proposal-review-core-design.md` — Remove "Rich text / WYSIWYG editing" from Non-Goals; update tech stack table; update component tree

**Behavior:**
- `AGENTS.md` structure section: replace `src/components/document/ — markdown viewer, activity indicator, editor` with `src/components/document/ — MilkdownDocument (view/WYSIWYG/raw), activity indicator, milkdown plugins`
- `AGENTS.md` conventions: replace "Keep markdown DOM helpers inside `src/lib/markdown/`" with "Keep ProseMirror plugins inside `src/components/document/milkdown/`"
- Tech stack in core design spec: replace `react-markdown + remark/rehype plugins` with `Milkdown Crepe (@milkdown/crepe, @milkdown/react, @milkdown/kit)`
- Remove the `src/lib/markdown/` entry from structure since it's deleted

**Checklist:**
- [ ] `AGENTS.md` reflects the current file structure accurately
- [ ] Architecture docs mention Milkdown, not react-markdown
- [ ] Core design spec's Non-Goals updated (WYSIWYG is now a goal)
- [ ] No references to deleted files remain in documentation

**Tests:**
- [ ] No tests needed — documentation only

**Commit:**
- [ ] Read `skill://conventional-commit`, stage, commit


---

### Task 10: Final Validation

**Checks:**
- [ ] Full test suite passes: `npx vitest run`
- [ ] Type check clean: `npx tsc --noEmit`
- [ ] Lint clean: `npx eslint src/`
- [ ] Format check: `npx prettier --check src/`
- [ ] Build succeeds: `npm run build`
- [ ] E2E passes: `npx playwright test`
- [ ] Dev server starts and renders a proposal with comments: `npm run dev`
- [ ] All acceptance criteria from Tasks 1–9 verified end-to-end
- [ ] No references to `react-markdown`, `MarkdownRenderer`, `MarkdownEditor`, `SelectionPopover`, or `ProposalEdit` remain in source
- [ ] The spike worktree (`~/gopro/draftspace-milkdown-spike`) can be removed (branch merged or abandoned)
