#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-redraft}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "Branch '${BRANCH}' already exists."
  exit 0
fi

git checkout --orphan "${BRANCH}"
git rm -rf . >/dev/null 2>&1 || true

# Seed a placeholder so the branch's commit has a NON-EMPTY tree.
# GitHub's Git Trees API returns 404 for a branch whose commit points at the
# empty tree, which ReDraft misreads as "branch does not exist" and blocks
# commenting. Any tracked file avoids this; this README also documents the
# branch for anyone who stumbles onto it. The file lives under `.redraft/` so
# ReDraft's tree scan ignores it (it is not a `*.comments.json` sidecar).
mkdir -p .redraft
cat > .redraft/README.md <<'EOF'
# ReDraft sidecar branch

This branch stores ReDraft review comments as sidecar JSON files under
`.redraft/comments/<document-branch>/<document-path>.comments.json`.

It is managed by ReDraft; you normally do not edit it by hand. This file also
keeps the branch's tree non-empty — an empty branch makes GitHub's Git Trees
API return 404, which ReDraft would report as a missing comments branch.
EOF

git add .redraft/README.md
git commit -m "Initialize ReDraft sidecar branch"
git checkout "${CURRENT_BRANCH}"

echo "Created orphan branch '${BRANCH}'. Push with: git push origin ${BRANCH}"
