import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './useAuth';
import { GitHubClient } from '../lib/github';
import type { CommentFile, CommitInfo } from '../lib/github/types';

export function useProposal(path: string) {
  const { pat, repo } = useAuth();

  const client = useMemo(() => {
    if (!pat || !repo) {
      return null;
    }

    return new GitHubClient({ pat, owner: repo.owner, repo: repo.repo });
  }, [pat, repo]);

  const contentQuery = useQuery({
    queryKey: ['proposal', path, 'content'],
    queryFn: async () => {
      if (!client) {
        throw new Error('Authentication is required');
      }

      return client.getFileContent(path);
    },
    enabled: Boolean(client),
  });

  const commentsPath = path.replace(/\.md$/, '.comments.json');

  const commentsQuery = useQuery({
    queryKey: ['proposal', path, 'comments'],
    queryFn: async () => {
      if (!client) {
        throw new Error('Authentication is required');
      }

      return (
        (await client.getFileContent(commentsPath, { optional: true })) ?? null
      );
    },
    enabled: Boolean(client),
  });

  const commitQuery = useQuery({
    queryKey: ['proposal', path, 'commit'],
    queryFn: async () => {
      if (!client) {
        throw new Error('Authentication is required');
      }

      return client.getLatestCommit(path);
    },
    enabled: Boolean(client),
  });

  const comments = commentsQuery.data?.content
    ? (JSON.parse(commentsQuery.data.content) as CommentFile)
    : null;

  return {
    content: contentQuery.data?.content ?? '',
    sha: contentQuery.data?.sha ?? '',
    comments,
    commentsSha: commentsQuery.data?.sha ?? null,
    commit: (commitQuery.data as CommitInfo | null | undefined) ?? null,
    isLoading:
      contentQuery.isLoading ||
      commentsQuery.isLoading ||
      commitQuery.isLoading,
    error:
      contentQuery.error ?? commentsQuery.error ?? commitQuery.error ?? null,
  };
}
