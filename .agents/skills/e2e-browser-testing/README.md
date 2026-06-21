# e2e-browser-testing

Project-local OMP skill for running browser E2E tests and smoke checks against the ReDraft app in either remote GitHub mode or local filesystem mode.

## Intended use

Use this skill when a user wants to:
- run the Playwright regression suite against the remote or local Playwright project
- smoke-test a recent change in a real browser
- investigate a UI regression or verify browser-visible behavior
- validate the local server flow end-to-end (auth bypass, file writeback, watcher updates)
- drive the browser manually when automated coverage is not enough

## Assumptions

- The repo has a working `npx playwright test` setup with `remote` and `local` projects
- Remote tests mock GitHub API traffic and do not require a real PAT
- Local tests require a built frontend (`npm run build`) and the local server (`npm run serve`)
- Destructive local tests run against a writable copy of `proposals/` in `/tmp`, not the checked-in tree

## Files

- `SKILL.md` — skill definition, workflow instructions, and browser-driving patterns
- `evals/evals.json` — seed prompts for future trigger/output evaluation
