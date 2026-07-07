# Decisions

- 2026-07-07: Resumed `/review` after all `PLAN.md` tasks and checkboxes were already complete. Chose not to reopen or edit frozen plan/spec prose; proceeded with a post-implementation review pass against the completed branch.
- 2026-07-07: Fixed Settings comments-branch hydration by syncing local input state from `sidecarBranch` when auth state changes. Rejected leaving the initializer-only state because persisted branch overrides load asynchronously and can otherwise be overwritten by the default `redraft` value.
- 2026-07-07: Made local sidecar plumbing idempotent by comparing the temp-index tree to the current sidecar branch tree before creating a commit. This preserves the plan's plumbing design while avoiding duplicate no-op commits caused by `.redraft/` files remaining untracked on the document branch.
- 2026-07-07: Extended `updateRepo` with an optional submitted sidecar branch so Settings can persist the comments branch for the target repository during a repository change. Kept `setSidecarBranch` for same-repository saves to preserve existing Settings behavior.
- 2026-07-07: Changed the local tree route's failed-HEAD fallback from literal `HEAD` to `main`, matching `useAuth` local branch detection fallback so non-git local mode uses one sidecar namespace.
- 2026-07-07: Updated local watcher invalidation to strip the branch namespace from `.redraft/comments/<branch>/...` before invalidating document comment queries.
- 2026-07-07: Restricted document commits to the same sidecar-excluding pathspec used for staging, preventing manually pre-staged `.redraft/` files from leaking into the document branch.
