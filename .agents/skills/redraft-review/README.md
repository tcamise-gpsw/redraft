# redraft-review

Project-local OMP skill for reviewing unresolved ReDraft comment threads in local mode.

## Intended use

Use this skill when a user wants to:
- walk through unresolved proposal comments one by one
- draft replies before posting them
- resolve or reopen local ReDraft comment threads
- revise proposal markdown while keeping the browser UI in sync

## Assumptions

- The repo contains a `proposals/` directory
- The local ReDraft server is available (default `http://127.0.0.1:4200`)
- Proposal markdown is read directly from disk
- Comment mutations go through the local ReDraft API for SHA-safe writes

## Files

- `SKILL.md` — skill definition and workflow instructions
- `evals/evals.json` — seed prompts for future trigger/output evaluation
