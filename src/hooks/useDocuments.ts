import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from './useAuth';
import { GitHubClient, NotFoundError } from '../lib/github';
import { commentPath, sanitizeBranch } from '../lib/comments/paths';
import { getApiBaseUrl, isLocalMode } from '../lib/mode';
import { useToast } from './useToast';
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
  const { pat, repo, branch, sidecarBranch } = useAuth();
  const localMode = isLocalMode();
  const { showToast } = useToast();
  const missingSidecarToastBranch = useRef<string | null>(null);

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
    queryKey: ['documents', 'tree', branch, sidecarBranch],
    queryFn: async () => {
      if (!client || !repo) {
        return {
          documents: [] as DocumentNode[],
          underReview: [] as ReviewEntry[],
        };
      }

      if (localMode) {
        const response = await fetchLocalTree(
          getApiBaseUrl(),
          repo.owner,
          repo.repo,
        );
        return {
          documents: buildTree(response.documents),
          underReview: response.underReview,
        };
      }

      if (!branch || !sidecarBranch) {
        return {
          documents: [] as DocumentNode[],
          underReview: [] as ReviewEntry[],
        };
      }

      const documentItemsPromise = client.getTree(branch);
      const sidecarItemsPromise =
        branch === sidecarBranch
          ? documentItemsPromise
          : client
              .getTree(sidecarBranch)
              .then((items) => {
                missingSidecarToastBranch.current = null;
                return items;
              })
              .catch((error: unknown) => {
                if (!(error instanceof NotFoundError)) {
                  throw error;
                }

                if (missingSidecarToastBranch.current !== sidecarBranch) {
                  missingSidecarToastBranch.current = sidecarBranch;
                  showToast({
                    tone: 'error',
                    title: `Branch '${sidecarBranch}' not found. Create it with the setup script or update the branch name in Settings.`,
                  });
                }

                return [] satisfies TreeItem[];
              });

      const [documentItems, sidecarItems] = await Promise.all([
        documentItemsPromise,
        sidecarItemsPromise,
      ]);
      if (branch === sidecarBranch) {
        missingSidecarToastBranch.current = null;
      }
      const markdownItems = documentItems.filter((item) =>
        item.path.endsWith('.md'),
      );
      const sidecarPrefix = `.redraft/comments/${sanitizeBranch(branch)}/`;
      const sidecarPaths = new Set(
        sidecarItems
          .filter((item) => item.path.startsWith(sidecarPrefix))
          .map((item) => item.path),
      );

      const underReview = markdownItems
        .filter((item) => sidecarPaths.has(commentPath(item.path, branch)))
        .map(
          (item) =>
            ({ path: item.path, unresolvedCount: 0 }) satisfies ReviewEntry,
        );

      return {
        documents: buildTree(markdownItems),
        underReview,
      };
    },
    enabled:
      Boolean(client) &&
      (localMode || (branch !== null && sidecarBranch !== null)),
  });

  return {
    documents: query.data?.documents ?? [],
    underReview: query.data?.underReview ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
