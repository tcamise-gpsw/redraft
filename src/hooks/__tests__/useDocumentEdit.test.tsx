// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateFile = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../lib/github/client', () => ({
  ConflictError: class ConflictError extends Error {},
  GitHubClient: class GitHubClient {
    updateFile = updateFile;
  },
}));

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    pat: 'ghp_test',
    repo: { owner: 'acme', repo: 'workspace' },
  }),
}));

vi.mock('../useToast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );

  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

import { useDocumentEdit } from '../useDocumentEdit';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDocumentEdit', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    updateFile.mockReset().mockResolvedValue({ sha: 'updated-sha' });
    navigate.mockReset();
    showToast.mockReset();
  });

  it('updates the document, invalidates document queries, and navigates to /d/<path>', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDocumentEdit('docs/arch.md'), {
      wrapper,
    });

    await act(async () => {
      await result.current.save('# Updated\n', 'doc-sha');
    });

    expect(updateFile).toHaveBeenCalledWith(
      'docs/arch.md',
      '# Updated\n',
      'doc-sha',
      'Update: arch.md',
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['document', 'docs/arch.md', 'content'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['document', 'docs/arch.md', 'commit'],
    });
    expect(navigate).toHaveBeenCalledWith('/d/docs/arch.md');
    expect(showToast).toHaveBeenCalledWith({
      tone: 'info',
      title: 'Document saved',
    });
  });
});
