# Architecture

## Overview

ReDraft is a static React SPA deployed to GitHub Pages. The UI authenticates with a fine-grained GitHub PAT, reads proposal markdown and sidecar comment JSON files through the GitHub REST API, and writes edits/comments back as commits.

## High-level structure

- `src/components/auth/` — authentication gate and settings
- `src/components/layout/` — shell, header, shared layout
- `src/components/tree/` — proposal navigation tree
- `src/components/document/` — Milkdown view/WYSIWYG/raw editing surface
- `src/components/comments/` — sidebar comment threads and forms
- `src/lib/github/` — typed GitHub API client
- `src/lib/comments/` — anchor resolution and comment-side logic
- `src/hooks/` — TanStack Query hooks and local UI state
- `src/types/` — shared domain interfaces

## Core data flow

1. User enters a PAT and `owner/repo`.
2. The app validates the PAT via `GET /user`.
3. Proposal tree data comes from the Git tree API under `proposals/`.
4. Proposal content comes from `GET /repos/:owner/:repo/contents/:path`.
5. Comment data lives in sidecar `*.comments.json` files.
6. Edits and comments are persisted through GitHub Contents API writes using the latest file SHA.

## Repository conventions

- Proposal files live under `proposals/`
- Sidecar comment files mirror proposal paths with a `.comments.json` suffix
- Comments are anchored by quote plus prefix/suffix context
- Concurrency uses activity indicators plus SHA-based optimistic locking

## Routing

Hash routing is required for GitHub Pages:

- `/#/` — tree root
- `/#/proposals/:path` — proposal view and editing
- `/#/settings` — PAT and repository configuration
