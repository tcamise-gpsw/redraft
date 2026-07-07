# Learnings

- 2026-07-07: `PLAN.md` contained no remaining unchecked boxes on resume, so additional work should be limited to review/verification findings rather than plan implementation changes unless a defect is found.
- 2026-07-07: Settings state derived from `useAuth()` can see `null` during async branch hydration even in remote mode; tests need a rerender case to protect persisted sidecar branch overrides.
- 2026-07-07: Git status reports branch-excluded sidecar files as changed repeatedly because they remain outside the document branch index. Sidecar commit routing must compare against the sidecar branch tree, not just working-tree dirtiness.
- 2026-07-07: Settings repository changes and comments-branch changes are coupled in one form, so auth APIs need to persist branch settings against the submitted repository, not the current React context repository.
- 2026-07-07: Local non-git mode has two branch-name sources (`/api/git/branch` and tree `HEAD` resolution); their fallbacks must stay identical or review detection splits across namespaces.
- 2026-07-07: Client-side watcher invalidation has its own comment-path inverse; server-side path fixes do not protect query invalidation unless this inverse is updated too.
- 2026-07-07: `git commit` without a pathspec commits all currently staged files, even if preceding `git add` used exclusion pathspecs. The commit command itself needs the same pathspec boundary.
