# Learnings

- 2026-06-21 — Task 1: `bin/redraft.mjs` already existed with a `"bin"` field in `package.json`, but it spawned `tsx` via `spawnSync` — meaning it only worked in the development checkout where `tsx` is a devDependency. The bin field being present created false confidence that the package was already publish-ready.

- 2026-06-21 — Task 2: `import.meta.url` in an esbuild bundle refers to the output file's location, not any of the original source files. This made the `resolveUiRoot()` path math (`../dist` from `dist-server/`) work correctly without any source modification — the key insight is that esbuild rewrites `import.meta.url` to the bundle path at build time.

- 2026-06-21 — Task 3: The `esbuild` bundler emitted the entire server at 21.4 KB — small enough to confirm it inlined all local modules and kept runtime dependencies external. This is a useful sanity check: a bundle suspiciously close to the input size means dependencies leaked in; a near-zero size means the entry point was treated as a passthrough.

- 2026-06-21 — Task 4: `node bin/redraft.mjs ./proposals --port 4299` started and printed the listening URL cleanly with a 3-second timeout. The dynamic import chain (`bin → dist-server/cli.mjs`) resolved without any module-not-found error, confirming the relative URL path in the bin wrapper is correct.
