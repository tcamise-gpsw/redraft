# Milkdown Migration — Design Spec

Replace the current `react-markdown` renderer and `<textarea>` editor with Milkdown Crepe, enabling read-only rendering, WYSIWYG editing, and raw markdown editing in a single unified component.

## Problem

The current markdown pipeline has structural weaknesses:

1. **Comment highlighting is fragile** — `MarkdownRenderer` injects `<mark>` tags into the markdown string before passing it to `react-markdown`. This breaks when quotes contain markdown syntax, span multiple paragraphs, or overlap.
2. **Text selection relies on DOM gymnastics** — `SelectionPopover` uses `window.getSelection()` and string-searches the DOM `textContent` to locate the quote position. This is unreliable across block boundaries and produces wrong prefix/suffix for nested structures.
3. **No WYSIWYG** — Editing is a raw `<textarea>` with no preview. Users must know markdown syntax.
4. **Two separate components** — `MarkdownRenderer` and `MarkdownEditor` share no code or state. Switching between view and edit requires a route change and full remount.

## Solution

A single `MilkdownDocument` component backed by Milkdown Crepe that provides three modes:

- **View** — read-only rendered markdown with comment decorations and text selection
- **WYSIWYG** — editable rich-text with the same comment decorations
- **Raw** — plain textarea for power users who prefer raw markdown

Comment highlights use ProseMirror `DecorationSet` (no markdown string surgery). Text selection uses `EditorView.state.selection` (no DOM `getSelection` hacks). Both work identically in View and WYSIWYG modes.

## Success Criteria

- `react-markdown`, `rehype-raw`, `rehype-highlight`, and `remark-gfm` are removed from dependencies
- Markdown renders at least as well as before (headings, lists, tables, code blocks, links, images)
- GFM (tables, task lists, strikethrough) renders correctly
- Mermaid fenced code blocks render as diagrams
- Comment highlights appear on quoted text without modifying the markdown string
- Selecting text surfaces `{ quote, context: { prefix, suffix } }` via ProseMirror state
- Clicking a comment highlight calls `onSelectComment(id)`
- WYSIWYG mode allows editing with toolbar, slash commands, and table support
- Raw mode provides the existing textarea experience
- Mode switching preserves content (no data loss)

## Non-Goals

- Collaborative editing (Y.js)
- Image upload (proposals are text-only)
- AI features
- Custom slash command extensions beyond Crepe defaults

---

## Architecture

### Dependencies

**Add:**

- `@milkdown/crepe` — batteries-included WYSIWYG editor
- `@milkdown/react` — React bindings (`MilkdownProvider`, `useEditor`, `useInstance`)
- `@milkdown/kit` — core utilities (`$prose`, `$view`, `editorViewCtx`, presets)
- `mermaid` — diagram rendering library

**Remove:**

- `react-markdown`
- `rehype-highlight`
- `rehype-raw`
- `remark-gfm`

### Component Tree

```
DocumentView
├── ActivityIndicator
├── MilkdownDocument                    ← NEW (replaces MarkdownRenderer + MarkdownEditor)
│   ├── ModeToggle                      ← View | WYSIWYG | Raw tabs
│   ├── CrepeEditor                     ← Shared Crepe instance (read-only or editable)
│   │   ├── commentPlugin               ← ProseMirror Plugin<DecorationSet>
│   │   ├── mermaidNodeView             ← Custom node view for mermaid code blocks
│   │   └── selectionCapture            ← mouseup → onTextSelect
│   └── RawEditor                       ← textarea fallback (only mounted in Raw mode)
├── SelectionPopover                    ← REPLACED (logic moves into MilkdownDocument)
└── CommentsSidebar                     ← unchanged
```

### File Layout

```
src/components/document/
├── MilkdownDocument.tsx                ← Main component (mode toggle + routing)
├── MilkdownDocument.test.tsx           ← Unit tests
├── milkdown/
│   ├── CrepeEditor.tsx                 ← Crepe wrapper with useEditor
│   ├── commentPlugin.ts               ← ProseMirror decoration plugin
│   ├── mermaidNodeView.tsx             ← Custom node view for mermaid blocks
│   ├── selectionCapture.ts            ← mouseup hook for text selection
│   └── useCrepeInstance.ts            ← Shared hook: editor lifecycle + comment sync
├── RawEditor.tsx                       ← Textarea (inlined from current MarkdownEditor)
├── DocumentView.tsx                    ← Updated to use MilkdownDocument
└── ActivityIndicator.tsx               ← unchanged
```

---

## Component Design

### `MilkdownDocument`

The top-level component replaces both `MarkdownRenderer` and `MarkdownEditor`.

```typescript
interface MilkdownDocumentProps {
  content: string;
  onSave: (markdown: string) => Promise<void>;
  isSaving?: boolean;
  comments: CommentHighlight[];
  onTextSelect: (selection: TextSelection) => void;
  onSelectComment: (id: string) => void;
}

interface CommentHighlight {
  id: string;
  quote: string;
}

interface TextSelection {
  quote: string;
  context: { prefix: string; suffix: string };
}
```

**Behavior:**

- Defaults to **View** mode (read-only Crepe)
- Mode toggle at top-right: `View | WYSIWYG | Raw`
- In View and WYSIWYG modes, the same Crepe instance is used — switching between them calls `crepe.setReadonly(bool)` without remounting
- Switching to Raw mode unmounts Crepe and mounts a textarea pre-filled with the current markdown
- Switching back from Raw re-mounts Crepe with the (possibly edited) markdown
- `onSave` is called from Save buttons in WYSIWYG and Raw modes
- In View mode, no Save button is shown

### Comment Highlight Plugin (`commentPlugin.ts`)

A ProseMirror `Plugin<DecorationSet>` registered before `crepe.create()`:

1. **`state.init`** — Builds decorations from initial `comments` prop using the multi-node text search algorithm (see below)
2. **`state.apply`** — On `tr.getMeta(commentPluginKey)` with new comments, rebuilds decorations. Otherwise maps existing decorations through `tr.mapping` to track position drift during edits.
3. **`props.decorations`** — Returns the `DecorationSet` for rendering
4. **`props.handleClick`** — Checks `event.target.closest('[data-comment-id]')` and calls `onSelectComment(id)`

**Multi-node text search (fix from main worktree):**

```
1. Flatten doc to plain text via doc.textBetween(0, doc.content.size, '\n', '\0')
2. For each comment quote, find its char offset in the flat string
3. Walk doc.descendants() to convert char offsets → ProseMirror positions
4. Create Decoration.inline(from, to, { class, data-comment-id })
```

This handles quotes that span bold, italic, links, and other inline marks — the critical fix over per-text-node searching.

**Live updates without remount:**
When the `comments` prop changes, the hook dispatches `view.state.tr.setMeta(commentPluginKey, newComments)`. The plugin's `apply` rebuilds the `DecorationSet` from the new list.

### Selection Capture (`selectionCapture.ts`)

A `mouseup` listener on `view.dom` that:

1. Reads `view.state.selection.{from, to}`
2. If `selection.empty`, returns (no-op)
3. Calls `doc.textBetween(from, to, ' ')` for the quote
4. Calls `doc.textBetween(max(0, from - 100), from, ' ')` for prefix
5. Calls `doc.textBetween(to, min(size, to + 100), ' ')` for suffix
6. Fires `onTextSelect({ quote, context: { prefix, suffix } })`

This replaces `SelectionPopover`'s DOM approach entirely. The popover UI (the floating "Comment" button) moves into `MilkdownDocument` — positioned relative to the ProseMirror selection coordinates via `view.coordsAtPos(from)`.

### Mermaid Node View (`mermaidNodeView.tsx`)

Registered via `$view()` on the code block node when `node.attrs.language === 'mermaid'`:

- **View and WYSIWYG modes**: Renders the mermaid diagram as an SVG (calls `mermaid.render()`). The code block is displayed as a rendered diagram only — editing mermaid source requires switching to Raw mode.
- **Fallback**: If mermaid parsing fails, shows the raw code block with an error indicator

Implementation: Use Milkdown's `$view()` utility to register a React component as the node view for code blocks matching the mermaid language. The component calls `mermaid.render(id, code)` and inserts the resulting SVG. In WYSIWYG mode the node view is non-editable (the user must switch to Raw to modify mermaid source).

### `RawEditor` (textarea fallback)

Extracted from the current `MarkdownEditor.tsx` with minimal changes:

- Same textarea with tab-insert, character/line count
- Same Save/Cancel buttons
- Receives content from `MilkdownDocument` parent when switching to Raw mode
- On Save, calls `onSave` with textarea content
- On Cancel, switches back to View mode with original content (discards unsaved edits)

---

## Routing Changes

The separate `/proposals/:path/edit` route is **removed**. Editing happens inline via the mode toggle:

| Before                               | After                                                        |
| ------------------------------------ | ------------------------------------------------------------ |
| `/#/proposals/:path` → view only     | `/#/proposals/:path` → view + mode toggle (View/WYSIWYG/Raw) |
| `/#/proposals/:path/edit` → textarea | Removed — WYSIWYG/Raw accessible from toggle                 |

The "Edit" link in `DocumentView` becomes the WYSIWYG mode toggle button, not a route navigation. This eliminates the full remount and re-fetch when switching between view and edit.

---

## Styling

### Dark Theme Integration

Crepe ships with `frame-dark.css`. We override CSS variables scoped to `.milkdown-document-wrapper`:

```css
.milkdown-document-wrapper .milkdown {
  --crepe-color-background: transparent;
  --crepe-color-surface: rgb(15 23 42); /* slate-900 */
  --crepe-color-on-background: rgb(241 245 249); /* slate-100 */
  --crepe-color-border: rgb(30 41 59); /* slate-800 */
}
```

### Comment Highlight Styles

```css
.milkdown-comment-highlight {
  background-color: rgb(251 191 36 / 0.2); /* amber-400/20 */
  border-bottom: 2px solid rgb(251 191 36); /* amber-400 */
  cursor: pointer;
  border-radius: 2px;
  transition: background-color 150ms;
}

.milkdown-comment-highlight:hover {
  background-color: rgb(251 191 36 / 0.35);
}
```

### Prose Styling

Crepe handles typography (headings, paragraphs, lists, code blocks) internally. No need for Tailwind's `prose` classes on the container — Crepe's frame theme provides equivalent typographic styling already tuned for dark mode.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ DocumentView                                                     │
│                                                                  │
│   useProposal(path) → { content, comments, commit, sha }        │
│                          │           │                           │
│                          ▼           ▼                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ MilkdownDocument                                         │   │
│   │                                                          │   │
│   │   content ──────→ Crepe defaultValue / replaceAll        │   │
│   │   comments ─────→ commentPlugin (DecorationSet)          │   │
│   │   onTextSelect ←─ selectionCapture (mouseup)             │   │
│   │   onSelectComment ←─ commentPlugin handleClick           │   │
│   │   onSave ───────→ useProposalEdit.save(content, sha)     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Content Sync

- **Initial load**: `content` prop passed as `defaultValue` to Crepe constructor
- **External update** (another user saved): Use `editor.action(replaceAll(newContent))` to update in place without remounting. Only fires when `content` prop identity changes AND the editor is in read-only mode (View). In WYSIWYG/Raw modes, external updates are blocked (user is editing).
- **Save**: In WYSIWYG, `crepe.getMarkdown()` returns current content. In Raw, read from textarea state. Both call `onSave(markdown)` which delegates to `useProposalEdit.save(content, sha)`.

---

## Error Handling

| Scenario                                 | Behavior                                                           |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Crepe fails to initialize                | Show fallback: raw markdown in a `<pre>` block + error banner      |
| Mermaid parse error                      | Show the raw code block with syntax error indicator                |
| Save conflict (SHA mismatch)             | Toast: "File was modified since you loaded it" (existing behavior) |
| Mode switch with unsaved WYSIWYG changes | Confirm dialog: "You have unsaved changes. Discard?"               |

Wrap `CrepeEditor` in a React error boundary that catches ProseMirror/Crepe initialization errors and degrades to raw content display.

---

## Migration Steps (implementation order)

1. **Create `milkdown/` module** — `commentPlugin.ts`, `selectionCapture.ts`, `mermaidNodeView.tsx`, `CrepeEditor.tsx`, `useCrepeInstance.ts`
2. **Create `MilkdownDocument.tsx`** — compose the modules above with mode toggle
3. **Update `DocumentView.tsx`** — replace `MarkdownRenderer` + `SelectionPopover` with `MilkdownDocument`
4. **Remove `/edit` route** — merge edit capability into the view route via mode toggle
5. **Remove old dependencies** — `react-markdown`, `rehype-raw`, `rehype-highlight`, `remark-gfm`
6. **Delete old files** — `MarkdownRenderer.tsx`, `MarkdownEditor.tsx`, old tests
7. **Pull multi-node fix** — bring the multi-node quote matching from the main worktree into `commentPlugin.ts`
8. **Add mermaid** — install `mermaid`, implement `mermaidNodeView.tsx`
9. **Update styles** — Crepe dark overrides + comment highlight CSS in `index.css`
10. **Tests** — unit tests for commentPlugin, selectionCapture, mermaid rendering; update E2E specs
11. **Clean up** — update `AGENTS.md`, `README.md`, architecture docs

---

## Testing Strategy

### Unit Tests (Vitest)

- `commentPlugin.ts` — Given a ProseMirror doc + comments array, verify correct decoration positions (single node, multi-node, overlapping quotes, empty quotes)
- `selectionCapture.ts` — Mock EditorView state, verify `onTextSelect` payload
- `mermaidNodeView.tsx` — Given mermaid code, verify SVG output rendered
- `MilkdownDocument.tsx` — Mode switching preserves content, Save calls fire with correct markdown

### E2E Tests (Playwright)

Update existing specs:

- `proposals.spec.ts` — verify rendered markdown appears correctly
- `comments.spec.ts` — verify text selection produces comment popover, comment highlights are visible and clickable
- `editing.spec.ts` — verify WYSIWYG editing + save, Raw editing + save, mode toggle

### Final Browser Verification

After all implementation is complete, run a real browser E2E session (`npx playwright test`) against the dev server to confirm the full integration end-to-end: load a proposal, verify rendering, select text, add a comment, switch to WYSIWYG mode, edit and save, verify persistence. This uses the E2E skill in the repo and is the gate for declaring the migration done.

---

## Risks and Mitigations

| Risk                                                       | Likelihood | Impact | Mitigation                                                                                                  |
| ---------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Crepe CSS conflicts with Tailwind                          | Medium     | Low    | Scope all Crepe overrides under `.milkdown-document-wrapper`; Crepe uses BEM-style classes that won't clash |
| Performance with large documents (>500 lines)              | Low        | Medium | ProseMirror is designed for large docs; Crepe adds minimal overhead. Profile if needed.                     |
| Crepe version upgrade breaks API                           | Low        | Medium | Pin `@milkdown/crepe` version; Milkdown has stable v7 API                                                   |
| Multi-node decoration positions drift during WYSIWYG edits | Medium     | Medium | Plugin's `state.apply` maps decorations through `tr.mapping`; rebuilds on comment prop changes              |
| Mermaid rendering blocks the main thread                   | Low        | High   | Use `mermaid.render()` which is async; show a skeleton placeholder while rendering                          |
