export interface ShareableParams {
  repo: { owner: string; repo: string } | null;
  branch: string | null;
}

export function parseShareableParams(
  hash = window.location.hash,
): ShareableParams {
  const queryStart = hash.indexOf('?');

  if (queryStart === -1) {
    return { repo: null, branch: null };
  }

  const params = new URLSearchParams(hash.slice(queryStart + 1));
  const repoParam = params.get('repo');
  const branchParam = params.get('branch');
  const parts = repoParam?.split('/') ?? [];

  return {
    repo:
      parts.length === 2 && parts[0] && parts[1]
        ? { owner: parts[0], repo: parts[1] }
        : null,
    branch: branchParam || null,
  };
}
