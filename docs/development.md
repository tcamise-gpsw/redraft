# Development

## Prerequisites

- Node.js 22+
- npm 10+
- A fine-grained GitHub PAT with:
  - Contents: Read/Write
  - Metadata: Read

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — create a production build
- `npm run preview` — preview the production build locally
- `npm run test` — run Vitest once
- `npm run serve -- [directory]` — serve local documents from source (dev only, requires `tsx`); omit `[directory]` to serve the current working directory
- `npm run build:server` — compile server TypeScript to `dist-server/cli.mjs` via esbuild
- `npm run typecheck` — run TypeScript without emitting
- `npm run format` — format the repository
- `npm run format:check` — verify formatting under `src/`
- `npm run e2e` — run Playwright tests

## Local workflow

1. Install dependencies with `npm install`.
2. Start the app with `npm run dev`.
3. Work against a development PAT supplied by the project owner when GitHub API verification is needed.
4. Use Playwright for real-browser verification of interactive flows as tasks land.

## Deployment

GitHub Actions builds on every push to `main` and deploys `dist/` to the `gh-pages` branch. The workflow sets `VITE_BASE_PATH` to the repository name so the built app resolves assets correctly under GitHub Pages.

## Configuration

The production app stores these values in localStorage:

- GitHub PAT
- target repository `owner/repo`
- authenticated user metadata returned by GitHub
