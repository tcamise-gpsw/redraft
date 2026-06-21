# Implementation Decisions

Append-only record of meaningful execution-time decisions.

## Task 0 — Project Scaffolding

- Kept `npm run serve -- ./proposals` on the root command path by making `server/cli.ts` accept either a direct directory argument or the explicit `serve` subcommand. This preserves the approved plan's script shape (`tsx server/cli.ts`) while still allowing the eventual `draftspace serve <dir>` UX from the CLI.
- Implemented the `draftspace` bin as a thin ESM wrapper that re-invokes Node with `--import tsx` and `server/cli.ts`. This keeps the package unpublished-friendly and avoids a separate compile step for the CLI during local dogfooding.
