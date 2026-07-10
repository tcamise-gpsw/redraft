# Architecture

## Overview

ReDraft is a shared React SPA with two backends:

- remote mode is a GitHub Pages deployment that talks directly to the GitHub REST API for repository content and review sidecars
- local mode serves the same frontend through a bundled Hono app that exposes GitHub-shaped endpoints over the local filesystem and git metadata

## High-level structure

- `src/components/` — auth, layout, document tree, editor, and comments UI
- `src/hooks/` — document loading, auth state, TanStack Query caching, and local file-change invalidation
- `src/lib/github/` — typed client for the GitHub-compatible API surface used by both modes
- `src/lib/comments/` — anchor resolution plus sidecar path helpers
- `server/routes/` — local GitHub-style REST endpoints and git status/commit helpers
- `server/fs/` — markdown discovery, filesystem reads/writes, sidecar branch access, and chokidar watching
- `server/ws/` — websocket fan-out for local cache invalidation

## Core data flow

1. The frontend loads a document tree and document content through GitHub-style tree and contents endpoints.
2. Document discovery walks all `.md` files under the selected repo/root, excluding built-in metadata directories such as `.git/`, `.redraft/`, and `node_modules/`.
3. Comment sidecars live at `.redraft/comments/<sanitizeBranch(document-branch)>/<mirrored-document-path>.comments.json`; `sanitizeBranch` replaces `/` with `--`.
4. Remote mode reads and writes documents and sidecars through GitHub APIs using the selected document branch plus the configured sidecar branch.
5. Local mode reads documents from the working tree, serves the static frontend, injects local-mode metadata, returns fake GitHub rate-limit headers, and uses chokidar + websockets so markdown or sidecar changes invalidate cached document/comment queries.
6. In local mode, sidecars can be read or written against `--sidecar-branch <string>` (default `redraft`); document files stay in the working tree while sidecar writes target the configured git branch namespace.

## Repository conventions

- Any markdown document in the repo/root can appear in the tree; there is no required subdirectory.
- Sidecar files mirror document paths under a sanitized document-branch namespace.
- Comments are anchored by quote plus prefix/suffix context.
- Local review state follows the active git branch for document namespaces, with detached `HEAD` normalized to `main`.

## Routing

Hash routing keeps static hosting and local mode aligned:

- `/#/` — document tree root
- `/#/d/*` — document view and editing
- `/#/settings` — auth, repository, and sidecar-branch configuration
