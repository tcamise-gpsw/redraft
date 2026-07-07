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
const showToast = vi.hoisted(() => vi.fn());

const TestNotFoundError = vi.hoisted(
  () =>
    class TestNotFoundError extends Error {
      readonly type = 'not_found';

      constructor() {
        super('Resource not found');
        this.name = 'NotFoundError';
      }
    },
);
const setSidecarBranch = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  branch: 'dev' as string | null,
  sidecarBranch: 'redraft' as string | null,
}));

vi.mock('../../lib/github/client', () => ({
  NotFoundError: TestNotFoundError,
  GitHubClient: class GitHubClient {
    getTree = getTree;
    getFileContent = getFileContent;
  },
}));

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    pat: 'ghp_test',
    repo: { owner: 'acme', repo: 'workspace' },
    branch: authState.branch,
    defaultBranch: 'main',
    sidecarBranch: authState.sidecarBranch,
    setBranch,
    setSidecarBranch,
  }),
}));

vi.mock('../../lib/mode', () => ({
  isLocalMode: () => false,
  getApiBaseUrl: () => 'https://api.github.com',
}));

vi.mock('../useToast', () => ({
  useToast: () => ({ showToast }),
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
    authState.branch = 'dev';
    authState.sidecarBranch = 'redraft';
    setSidecarBranch.mockReset();
    showToast.mockReset();
  });

  it('classifies under-review documents from a sidecar branch tree without calling getFileContent', async () => {
    getTree.mockImplementation(async (branch: string) => {
      if (branch === 'dev') {
        return [
          { path: 'docs/auth-overhaul.md', type: 'blob' },
          { path: 'docs/architecture.md', type: 'blob' },
          { path: 'README.md', type: 'blob' },
        ];
      }

      return [
        {
          path: '.redraft/comments/dev/docs/auth-overhaul.comments.json',
          type: 'blob',
        },
      ];
    });

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getTree).toHaveBeenCalledWith('dev');
    expect(getTree).toHaveBeenCalledWith('redraft');
    expect(
      queryClient.getQueryState(['documents', 'tree', 'dev', 'redraft']),
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

  it('marks every markdown blob whose branch-namespaced sidecar appears in the sidecar tree as under review', async () => {
    getTree.mockImplementation(async (branch: string) => {
      if (branch === 'dev') {
        return [
          { path: 'rfc-001.md', type: 'blob' },
          { path: 'rfc-002.md', type: 'blob' },
        ];
      }

      return [
        { path: '.redraft/comments/dev/rfc-001.comments.json', type: 'blob' },
        { path: '.redraft/comments/dev/rfc-002.comments.json', type: 'blob' },
        { path: '.redraft/comments/main/rfc-999.comments.json', type: 'blob' },
      ];
    });

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.underReview).toHaveLength(2);
    expect(result.current.underReview.map((e) => e.path).sort()).toEqual([
      'rfc-001.md',
      'rfc-002.md',
    ]);
    expect(getFileContent).not.toHaveBeenCalled();
  });

  it('uses a single tree fetch when the sidecar branch matches the document branch', async () => {
    authState.sidecarBranch = 'dev';
    getTree.mockResolvedValue([
      { path: 'docs/auth-overhaul.md', type: 'blob' },
      {
        path: '.redraft/comments/dev/docs/auth-overhaul.comments.json',
        type: 'blob',
      },
    ]);

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getTree).toHaveBeenCalledTimes(1);
    expect(getTree).toHaveBeenCalledWith('dev');
    expect(result.current.underReview).toEqual([
      { path: 'docs/auth-overhaul.md', unresolvedCount: 0 },
    ]);
  });

  it('keeps documents loaded and shows a toast when the sidecar branch is missing', async () => {
    getTree.mockImplementation(async (branch: string) => {
      if (branch === 'dev') {
        return [{ path: 'docs/auth-overhaul.md', type: 'blob' }];
      }

      throw new TestNotFoundError();
    });

    const { result } = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(flattenTree(result.current.documents)).toEqual([
      'docs/auth-overhaul.md',
    ]);
    expect(result.current.underReview).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(showToast).toHaveBeenCalledWith({
      tone: 'error',
      title:
        "Branch 'redraft' not found. Create it with the setup script or update the branch name in Settings.",
    });
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
