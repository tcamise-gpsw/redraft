import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './useAuth';
import { GitHubClient } from '../lib/github';
import { getApiBaseUrl } from '../lib/mode';
import type { ProposalNode } from '../types/proposals';
import type { TreeItem } from '../types/github';

function sortNodes(nodes: ProposalNode[]): ProposalNode[] {
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

function buildTree(items: TreeItem[]): ProposalNode[] {
  const root: ProposalNode[] = [];

  for (const item of items) {
    const relativePath = item.path.replace(/^proposals\//, '');

    if (!relativePath) {
      continue;
    }

    const parts = relativePath.split('/');
    let currentLevel = root;
    let currentPath = 'proposals';

    parts.forEach((part, index) => {
      currentPath = `${currentPath}/${part}`;
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

export function useProposals() {
  const { pat, repo } = useAuth();

  const client = useMemo(() => {
    if (!pat || !repo) {
      return null;
    }

    return new GitHubClient({ pat, owner: repo.owner, repo: repo.repo, baseUrl: getApiBaseUrl() });
  }, [pat, repo]);

  const query = useQuery({
    queryKey: ['proposals', 'tree'],
    queryFn: async () => {
      if (!client) {
        return [] as ProposalNode[];
      }

      const items = await client.getTree();
      return buildTree(
        items.filter(
          (item) =>
            item.type !== 'blob' || !item.path?.endsWith('.comments.json'),
        ),
      );
    },
    enabled: Boolean(client),
  });

  return {
    tree: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
