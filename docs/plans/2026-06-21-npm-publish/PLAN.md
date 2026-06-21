# ReDraft — npm Publish Plan

**Goal:** Make the local filesystem mode publishable to npm so that anyone can run `npx redraft <directory>` from any repo without cloning the ReDraft source.

**Spec:** `docs/specs/2026-06-21-local-mode-ai-skills-design.md`

---

### Task 1: Audit current publish readiness

**Files read:**
- `package.json` — identified `"private": true`, missing `files` field, `tsx`-dependent bin script
- `bin/redraft.mjs` — confirmed it spawned `tsx server/cli.ts`, which relies on a devDependency
- `server/cli.ts` — confirmed it calls `program.parse(process.argv)` at module level
- `server/app.ts` — confirmed `resolveUiRoot()` uses `new URL('../dist', import.meta.url)`

**Findings:**
1. `"private": true` blocks npm publish
2. `bin/redraft.mjs` called `tsx` (devDependency) — consumers don't have it
3. No `files` field — would publish entire repo including source, node_modules symlinks, etc.
4. Server is raw TypeScript with no compiled output — not runnable by Node directly

---

### Task 2: Design bundling strategy

**Decision:** Use `esbuild` to bundle `server/cli.ts` into `dist-server/cli.mjs`.
- All local TypeScript inlined into a single file
- npm dependencies (`hono`, `chokidar`, `ws`, `commander`, etc.) marked external via `--packages=external` — they're in `dependencies` so npm installs them for consumers
- `import.meta.url` in the bundled output points to `dist-server/cli.mjs`; `resolveUiRoot()`'s `new URL('../dist', import.meta.url)` then resolves to `dist/` correctly

**Layout after build:**
```
dist/          ← Vite frontend bundle (index.html + assets)
dist-server/   ← esbuild server bundle (cli.mjs)
bin/           ← shebang wrapper that imports dist-server/cli.mjs
```

---

### Task 3: Implement changes

**`package.json` changes:**
- Removed `"private": true`
- Added `"files": ["bin/", "dist/", "dist-server/"]` — only ship built artifacts
- Added `"build:server"` script: `esbuild server/cli.ts --bundle --platform=node --format=esm --outfile=dist-server/cli.mjs --packages=external`
- Updated `"build"` to chain: `vite build && npm run build:server`
- Added `"prepublishOnly": "npm run build"` — ensures build always runs before publish
- Added `"description"` and `"keywords"` for npm discoverability
- Added `esbuild` to `devDependencies`

**`bin/redraft.mjs` rewrite:**
```js
#!/usr/bin/env node
import(new URL('../dist-server/cli.mjs', import.meta.url)).catch((err) => {
  console.error('Failed to start redraft:', err.message);
  process.exit(1);
});
```
- Replaces the `spawnSync(tsx …)` approach with a direct dynamic import of the compiled output
- No runtime dependency on `tsx` or any other dev tooling

---

### Task 4: Verify

- `npm run build` → Vite + esbuild both succeed; `dist-server/cli.mjs` emitted at 21.4 KB
- `node bin/redraft.mjs --help` → commander help output renders correctly
- `node bin/redraft.mjs ./proposals --port 4299` → server starts and prints listening URL

- [x] All changes committed
