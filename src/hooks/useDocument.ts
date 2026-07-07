import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './useAuth';
import { GitHubClient } from '../lib/github';
import { getApiBaseUrl } from '../lib/mode';
import type { CommitInfo } from '../lib/github/types';

export function useDocument(path: string) {
  const { pat, repo, branch } = useAuth();

  const client = useMemo(() => {
    if (!pat || !repo) {
      return null;
    }

    return new GitHubClient({
      pat,
      owner: repo.owner,
      repo: repo.repo,
      baseUrl: getApiBaseUrl(),
    });
  }, [pat, repo]);

  const contentQuery = useQuery({
    queryKey: ['document', path, 'content', branch],
    queryFn: async () => {
      if (!client) {
        throw new Error('Authentication is required');
      }

      return client.getFileContent(path, { ref: branch ?? undefined });
    },
    enabled: Boolean(client),
  });

  const commitQuery = useQuery({
    queryKey: ['document', path, 'commit', branch],
    queryFn: async () => {
      if (!client) {
        throw new Error('Authentication is required');
      }

      return client.getLatestCommit(path, branch ?? undefined);
    },
    enabled: Boolean(client),
  });

  return {
    content: contentQuery.data?.content ?? '',
    sha: contentQuery.data?.sha ?? '',
    commit: (commitQuery.data as CommitInfo | null | undefined) ?? null,
    isLoading: contentQuery.isLoading || commitQuery.isLoading,
    error: contentQuery.error ?? commitQuery.error ?? null,
  };
}
