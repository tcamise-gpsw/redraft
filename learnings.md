# Implementation Learnings

Append-only record of surprises, bugs, and useful discoveries during execution.

## Task 1 - Server Discovery & Review Scan

- `localeCompare()` sorted `docs/visible.md` before `README.md`, so tests that care about output order need to assert the actual sorted order rather than assume root files appear first.
- Splitting `.redraft/` handling into two paths matters: the document walk must exclude it entirely, while the review scanner must recurse into `.redraft/comments/` explicitly.
