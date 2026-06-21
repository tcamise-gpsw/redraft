# Decisions

- 2026-06-21 — Task 2: Used `esbuild --bundle --packages=external` rather than `tsc` to compile the server. `tsc` emits one `.js` per `.ts` file and requires `outDir` + import path adjustments; esbuild produces a single self-contained `.mjs` with all local code inlined and zero runtime dev-tool dependency. Faster and simpler for a single entry point.

- 2026-06-21 — Task 2: Placed the compiled server bundle at `dist-server/cli.mjs` (not inside `dist/`) to keep the Vite frontend output self-contained. `resolveUiRoot()` in `app.ts` uses `new URL('../dist', import.meta.url)` — with the bundle one level down from the root, `../dist` resolves to the Vite output directory without any code change to `app.ts`.

- 2026-06-21 — Task 3: Kept `npm run serve` unchanged (`tsx server/cli.ts`) for local development. The `tsx`-based serve script gives fast iteration without a rebuild step; the `bin/` entry is the production/published path only.

- 2026-06-21 — Task 3: Used a dynamic `import()` in `bin/redraft.mjs` rather than a static import so that a clear error message surfaces if the package was installed without running `npm run build` first (e.g. linking from source). The `.catch()` handler prints the missing-file message and exits with code 1.

- 2026-06-21 — Task 3: Added `"prepublishOnly": "npm run build"` to guarantee that `dist/` and `dist-server/` are always fresh before any `npm publish`. This prevents accidentally shipping stale built output.

- 2026-06-21 — Task 3: Set `"files"` to `["bin/", "dist/", "dist-server/"]`. Without this, `npm pack` ships source, tests, node_modules hoisting files, and other noise. The three listed directories are the only things a consumer needs.
