# Implementation Decisions

Append-only record of meaningful execution-time decisions.

## Task 0 — Project Scaffolding

- Kept `npm run serve -- ./proposals` on the root command path by making `server/cli.ts` accept either a direct directory argument or the explicit `serve` subcommand. This preserves the approved plan's script shape (`tsx server/cli.ts`) while still allowing the eventual `draftspace serve <dir>` UX from the CLI.
- Implemented the `draftspace` bin as a thin ESM wrapper that re-invokes Node with `--import tsx` and `server/cli.ts`. This keeps the package unpublished-friendly and avoids a separate compile step for the CLI during local dogfooding.

## Task 1 — Filesystem Operations Layer

- Kept the filesystem layer pure and synchronous-at-the-boundary: all GitHub-shape concerns stay out of `server/fs/operations.ts`. The module only knows about bytes, paths, SHAs, and typed errors, which keeps the later Hono route layer thin.
- Used NodeNext-style `.js` relative imports inside server TypeScript files. The dedicated `server/tsconfig.json` uses NodeNext resolution, so explicit extensions avoid later runtime and editor divergence.
- Allowed `resolvePath()` to accept the root directory itself (`relative(base, base) === ''`). The guard only rejects resolved paths that escape the base (those whose relative path starts with `..`).

## Task 2 — GitHub API Adapter Routes

- Kept the local server API deliberately GitHub-shaped instead of introducing a Draftspace-specific REST surface. The frontend can keep using `GitHubClient` semantics later with only a base-URL override, which preserves the approved "same frontend, different backend" architecture.
- The routes treat the configured filesystem root as the logical `proposals/` directory. Tree responses prefix each entry with `proposals/`, while contents/commits routes strip that prefix before touching disk. This preserves frontend expectations without forcing the local server to serve an entire fake repository checkout.
- Centralized rate-limit headers and error mapping in `server/routes/index.ts` so the individual route files stay focused on transport logic rather than repeating response boilerplate.
