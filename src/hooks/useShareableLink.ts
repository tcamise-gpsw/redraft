import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { parseShareableParams } from '../lib/url';
import { useAuth } from './useAuth';

export interface ShareableLinkState {
  urlRepo: { owner: string; repo: string } | null;
  urlBranch: string | null;
  buildLink: (docPath?: string) => string;
  copyLink: (docPath?: string) => Promise<boolean>;
}

function buildSearch(owner: string, repo: string, branch: string): string {
  const params = [
    `repo=${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  ];
  params.push(`branch=${encodeURIComponent(branch)}`);
  return params.join('&');
}

export function useShareableLink(): ShareableLinkState {
  const [searchParams] = useSearchParams();
  const { repo, branch } = useAuth();

  const parsed = useMemo(
    () => parseShareableParams(`#/?${searchParams.toString()}`),
    [searchParams],
  );

  const buildLink = useCallback(
    (docPath?: string) => {
      const base = `${window.location.origin}${window.location.pathname}`;
      const normalizedPath = docPath?.replace(/^\/+/, '');
      const hashPath = normalizedPath ? `#/d/${normalizedPath}` : '#/';

      if (!repo || !branch) {
        return `${base}${hashPath}`;
      }

      return `${base}${hashPath}?${buildSearch(repo.owner, repo.repo, branch)}`;
    },
    [branch, repo],
  );

  const copyLink = useCallback(
    async (docPath?: string) => {
      try {
        await navigator.clipboard.writeText(buildLink(docPath));
        return true;
      } catch {
        return false;
      }
    },
    [buildLink],
  );

  return {
    urlRepo: parsed.repo,
    urlBranch: parsed.branch,
    buildLink,
    copyLink,
  };
}
