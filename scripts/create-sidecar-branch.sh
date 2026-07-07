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
git commit --allow-empty -m "Initialize ReDraft sidecar branch"
git checkout "${CURRENT_BRANCH}"

echo "Created orphan branch '${BRANCH}'. Push with: git push origin ${BRANCH}"
