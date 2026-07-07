## What

<!-- One paragraph describing what this PR changes and why. -->

## Mode scope

- [ ] GitHub mode affected
- [ ] Local mode affected
- [ ] Both modes / mode-agnostic

## Changes

<!--
Bullet list of the key files/components changed and what each does.
Skip files changed only by formatting or test fixes.
-->

-

## Testing

<!--
How was this tested? Delete lines that don't apply.
-->

- `npx vitest run` — N files, N tests
- `npx playwright test` — remote and local projects
- Manual smoke test: <!-- describe what you verified in the browser -->

## Checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint src/ server/` passes
- [ ] `npx prettier --check .` passes (use the **locked** version: `node_modules/.bin/prettier`)
- [ ] `npx vitest run` passes
- [ ] `npx playwright test` passes (or explain why skipped)
- [ ] Local mode unaffected by GitHub-mode changes (or explicitly scoped)
- [ ] No PAT, secret, or PII committed

## Breaking changes

<!-- Delete if none. Describe any API or storage-format changes that affect existing users. -->

None.
