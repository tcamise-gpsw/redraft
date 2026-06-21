# Implementation Learnings

Append-only record of surprises, bugs, and useful discoveries during execution.

## Task 0 — Project Scaffolding

- The edit tool will happily accept malformed JSON payload lines if the body is wrong; I introduced a stray `'},` line while editing `tsconfig.json` and had to repair it immediately. For small JSON updates, `npm pkg set` is safer than manual patching, and any direct `edit` to JSON needs an immediate `read` verification.
