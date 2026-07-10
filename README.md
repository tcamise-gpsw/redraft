<p align="center">
  <img src="assets/hero.png" alt="ReDraft — GitHub-based document review workspace">
</p>

<p align="center">
  <strong>Collaborative markdown review — powered by a branch in your repo.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/redraft-local"><img src="https://img.shields.io/npm/v/redraft-local?style=flat&colorA=222222&colorB=CB3837" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/redraft-local"><img src="https://img.shields.io/npm/dm/redraft-local?style=flat&colorA=222222&colorB=CB3837" alt="npm downloads"></a>
  <a href="https://github.com/tcamise-gpsw/redraft/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/tcamise-gpsw/redraft/ci.yml?style=flat&colorA=222222&colorB=3FB950" alt="CI"></a>
  <a href="https://redraft-docs.dev"><img src="https://img.shields.io/badge/site-redraft--docs.dev-58A6FF?style=flat&colorA=222222" alt="Site"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&colorA=222222&logo=typescript&logoColor=white" alt="TypeScript"></a>
</p>

ReDraft turns any Git repository into a review workspace for markdown documents. Select text, leave a comment, reply in threads, resolve feedback — all without leaving the browser. No database, no platform migration, no new accounts. Your documents stay as `.md` files. Review threads live on a sidecar branch. That's it.

|                 | **Local mode**                                        | **Remote mode**                              |
| --------------- | ----------------------------------------------------- | -------------------------------------------- |
| **Start with**  | `npx redraft-local`                                   | [redraft-docs.dev](https://redraft-docs.dev) |
| **Data source** | Files on disk                                         | GitHub REST API                              |
| **Auth**        | None — automatic                                      | Fine-grained GitHub PAT                      |
| **Editing**     | Browser UI (view · WYSIWYG · raw) + direct file edits | Browser UI (view · WYSIWYG · raw)            |
| **Comments**    | Git sidecar branch (local)                            | Git sidecar branch (remote)                  |
| **Best for**    | Power users, AI agents                                | Reviewers, contributors                      |

---

## Get started

**Run locally against any directory:**

```bash
npx redraft-local
```

Opens a browser at `http://127.0.0.1:4200` with every `.md` file in your working directory ready for review. No signup, no PAT, no config.

**Or use the hosted site for GitHub-backed review:**

Visit [redraft-docs.dev](https://redraft-docs.dev), enter a fine-grained PAT with `Contents: Read/Write` and `Metadata: Read`, point it at a repo, and start reviewing.

---

## How it works

ReDraft stores nothing outside your repository. Documents are plain `.md` files on any branch. Comment threads live as structured JSON on a dedicated sidecar branch (`redraft` by default) under `.redraft/comments/`. The sidecar branch never touches your working tree — no merge conflicts, no noise in diffs.

```
your-repo/
├── main (your documents)
│   ├── proposals/api-design.md
│   ├── rfcs/rfc-001.md
│   └── docs/architecture.md
│
└── redraft (sidecar branch — created automatically)
    └── .redraft/comments/main/
        ├── proposals/api-design.comments.json
        └── rfcs/rfc-001.comments.json
```

One React frontend serves all three modes. In remote mode, it talks to the GitHub REST API. In local mode, it talks to a local server that mirrors the same API shape against your filesystem. The code path is identical — only the transport changes.

---

## 01 · Browse and review documents

Open any markdown document in the repository. The left sidebar shows the full document tree and highlights documents with active review threads under **Under Review**. The center panel renders the document with full formatting. The right sidebar shows comment threads anchored to the text they reference.

![Document view with tree, rendered markdown, and comment threads](assets/screenshots/document-view.png)

## 02 · Inline comment threads

Select text in the document to anchor a comment. Threads support replies, resolution, and deletion. Comments stay anchored even when the document changes — ReDraft uses surrounding context to relocate anchors after edits. If the anchor text is gone entirely, the thread moves to an **Orphaned** section instead of silently disappearing.

![Comment threads anchored to document text](assets/screenshots/comment-threads.png)

## 03 · Three editing modes

Switch between **View**, **WYSIWYG**, and **Raw** depending on how you work.

| Mode        | Editor                      | Best for                             |
| ----------- | --------------------------- | ------------------------------------ |
| **View**    | Read-only rendered markdown | Reading and commenting               |
| **WYSIWYG** | Milkdown rich-text editor   | Non-technical reviewers, light edits |
| **Raw**     | Plain textarea              | Power users who think in markdown    |

![Raw markdown editing with comment sidebar](assets/screenshots/raw-markdown.png)

## 04 · Mermaid diagrams, code blocks, and full markdown

ReDraft renders the full CommonMark spec plus Mermaid diagrams, fenced code blocks with syntax highlighting, tables, blockquotes, and task lists. What you see in the browser is what your markdown looks like — no surprises.

![Mermaid flowchart rendered inline](assets/screenshots/mermaid-diagram.png)

## 05 · Local mode — one command, zero config

```bash
npx redraft-local            # serve current directory
npx redraft-local ./proposals # serve a specific path
```

Local mode gives you:

- **No PAT prompt** — auto-authenticated as `local-user`
- **Direct file read/write** — edits save straight to disk
- **Live file watching** — change a file in your editor, see it update in the browser instantly
- **Git sidecar comments** — review threads commit to a local `redraft` branch, never polluting your working tree
- **Optional git convenience** — status and commit endpoints for lightweight workflows

**Options:**

```
redraft [directory] [options]

  --port <number>   Port to listen on (default: 4200)
  --host <string>   Bind address (default: 127.0.0.1)
  --open            Open the browser automatically
  --no-ui           API-only mode, skip serving the frontend
```

## 06 · Built for AI agents

Local mode exposes a structured API that AI agents can drive directly. Agents edit `.md` files on disk while using the ReDraft API for comment operations — read threads, post replies, resolve feedback, revise documents. The browser UI updates live as agents work.

Typical agent workflows:

- Walk unresolved comment threads and draft responses
- Revise a document based on accumulated feedback
- Summarize open discussions across the repository
- Post structured review comments on any document

## 07 · Zero infrastructure

There is no database. No object store. No Redis. No account system. Your data is markdown files and JSON sidecars in a Git repository you already own. Remote mode is a static site on GitHub Pages. Local mode is a single Node process.

| Concern         | How ReDraft handles it                      |
| --------------- | ------------------------------------------- |
| Storage         | Git repository (your existing one)          |
| Authentication  | GitHub PAT (remote) · auto (local)          |
| Hosting         | GitHub Pages (remote) · `npx` (local)       |
| Conflict safety | SHA-based optimistic locking on every write |
| Portability     | Plain `.md` + `.json` — no vendor lock-in   |

---

## Development

```bash
npm install        # install deps + set up pre-commit hooks
npm run dev        # start Vite dev server (remote mode)
npm run build      # build frontend + local server
npm run serve      # start local server from built assets
npx vitest run     # run unit tests
npx playwright test # run E2E tests
```

For architecture details, development setup, and design specs:

- `docs/architecture.md` — system architecture and data flow
- `docs/development.md` — build, test, and deployment details
- `docs/specs/` — design specs and technical decisions
- `AGENTS.md` — repository guidance for coding agents
