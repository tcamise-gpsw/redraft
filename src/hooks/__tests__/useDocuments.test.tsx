// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTree = vi.hoisted(() => vi.fn());
const getFileContent = vi.hoisted(() => vi.fn());
const setBranch = vi.hoisted(() => vi.fn());

vi.mock('../../lib/github/client', () => ({
  GitHubClient: class GitHubClient {
    getTree = getTree;
    getFileContent = getFileContent;
  },
}));

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    pat: 'ghp_test',
    repo: { owner: 'acme', repo: 'workspace' },
    branch: 'dev',
    defaultBranch: 'main',
    setBranch,
  }),
}));

vi.mock('../../lib/mode', () => ({
  isLocalMode: () => false,
  getApiBaseUrl: () => 'https://api.github.com',
}));

import { useDocuments } from '../useDocuments';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDocuments (remote mode)', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    getTree.mockReset();
    getFileContent.mockReset();
  });

  it('classifies under-review documents from tree data without calling getFileContent', async () => {
    // Tree contains two markdown blobs and one matching sidecar
    getTree.mockResolvedValue([
      { path: 'docs/auth-overhaul.md', type: 'blob' },
      { path: 'docs/architecture.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      {
        path: '.redraft/comments/docs/auth-overhaul.comments.json',
        type: 'blob',
      },
    ]);

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getTree).toHaveBeenCalledWith('dev');
    expect(
      queryClient.getQueryState(['documents', 'tree', 'dev']),
    ).toBeDefined();

    // Only auth-overhaul has a sidecar → only it is under review
    expect(result.current.underReview).toEqual([
      { path: 'docs/auth-overhaul.md', unresolvedCount: 0 },
    ]);

    // Documents tree includes all three markdown files
    const allFiles = flattenTree(result.current.documents);
    expect(allFiles).toContain('docs/auth-overhaul.md');
    expect(allFiles).toContain('docs/architecture.md');
    expect(allFiles).toContain('README.md');

    // Critical: no per-file probing API calls
    expect(getFileContent).not.toHaveBeenCalled();
  });

  it('returns empty underReview when no sidecars are present in the tree', async () => {
    getTree.mockResolvedValue([
      { path: 'getting-started.md', type: 'blob' },
      { path: 'api-design.md', type: 'blob' },
    ]);

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.underReview).toHaveLength(0);
    expect(getFileContent).not.toHaveBeenCalled();
  });

  it('marks every markdown blob whose sidecar appears in the tree as under review', async () => {
    getTree.mockResolvedValue([
      { path: 'rfc-001.md', type: 'blob' },
      { path: 'rfc-002.md', type: 'blob' },
      { path: '.redraft/comments/rfc-001.comments.json', type: 'blob' },
      { path: '.redraft/comments/rfc-002.comments.json', type: 'blob' },
    ]);

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.underReview).toHaveLength(2);
    expect(result.current.underReview.map((e) => e.path).sort()).toEqual([
      'rfc-001.md',
      'rfc-002.md',
    ]);
    expect(getFileContent).not.toHaveBeenCalled();
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

function flattenTree(
  nodes: { path: string; type: string; children?: unknown[] }[],
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      paths.push(node.path);
    } else if (node.children) {
      paths.push(
        ...flattenTree(
          node.children as {
            path: string;
            type: string;
            children?: unknown[];
          }[],
        ),
      );
    }
  }
  return paths;
}
