import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './useAuth';
import { GitHubClient } from '../lib/github';
import { getApiBaseUrl, isLocalMode } from '../lib/mode';
import type { DocumentNode, ReviewEntry } from '../types/documents';
import type { TreeItem } from '../types/github';

interface LocalTreeResponse {
  documents: TreeItem[];
  underReview: ReviewEntry[];
}

function sortNodes(nodes: DocumentNode[]): DocumentNode[] {
  return [...nodes]
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }));
}

function buildTree(items: TreeItem[]): DocumentNode[] {
  const root: DocumentNode[] = [];

  for (const item of items) {
    if (!item.path) {
      continue;
    }

    const parts = item.path.split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;
      const nextType = isLast && item.type === 'blob' ? 'file' : 'directory';
      let existing = currentLevel.find((node) => node.path === currentPath);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: nextType,
          children: nextType === 'directory' ? [] : undefined,
        };
        currentLevel.push(existing);
      }

      if (existing.type === 'directory') {
        if (!existing.children) {
          existing.children = [];
        }
        currentLevel = existing.children;
      }
    });
  }

  return sortNodes(root);
}

function commentPath(path: string): string {
  return `.redraft/comments/${path.replace(/\.md$/u, '.comments.json')}`;
}

async function fetchLocalTree(baseUrl: string, owner: string, repo: string) {
  const response = await fetch(
    `${baseUrl}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? 'Unable to load documents.');
  }

  return (await response.json()) as LocalTreeResponse;
}

export function useDocuments() {
  const { pat, repo } = useAuth();
  const localMode = isLocalMode();

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

  const query = useQuery({
    queryKey: ['documents', 'tree'],
    queryFn: async () => {
      if (!client || !repo) {
        return { documents: [] as DocumentNode[], underReview: [] as ReviewEntry[] };
      }

      if (localMode) {
        const response = await fetchLocalTree(getApiBaseUrl(), repo.owner, repo.repo);
        return {
          documents: buildTree(response.documents),
          underReview: response.underReview,
        };
      }

      const items = await client.getTree();
      const markdownItems = items.filter((item) => item.path.endsWith('.md'));
      const underReview = (
        await Promise.all(
          markdownItems.map(async (item) => {
            const commentFile = await client.getFileContent(commentPath(item.path), {
              optional: true,
            });

            if (!commentFile) {
              return null;
            }

            return {
              path: item.path,
              unresolvedCount: 0,
            } satisfies ReviewEntry;
          }),
        )
      ).filter((entry): entry is ReviewEntry => entry !== null);

      return {
        documents: buildTree(markdownItems),
        underReview,
      };
    },
    enabled: Boolean(client),
  });

  return {
    documents: query.data?.documents ?? [],
    underReview: query.data?.underReview ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
