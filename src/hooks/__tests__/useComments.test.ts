// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const getFileContent = vi.hoisted(() => vi.fn());
const createFile = vi.hoisted(() => vi.fn());
const updateFile = vi.hoisted(() => vi.fn());

vi.mock('../../lib/github/client', () => ({
  ConflictError: class ConflictError extends Error {},
  GitHubClient: class GitHubClient {
    getFileContent = getFileContent;
    createFile = createFile;
    updateFile = updateFile;
  },
}));

import { AuthProvider } from '../useAuth';
import { useComments } from '../useComments';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function setStoredAuth() {
  localStorage.setItem(
    'proposal-review.auth',
    JSON.stringify({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(AuthProvider, null, children),
  );
}

describe('useComments', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    getFileContent.mockReset();
    createFile.mockReset();
    updateFile.mockReset();
  });

  it('creates a new comments file when adding the first comment', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockResolvedValueOnce({ sha: 'new-sha' });

    const { result } = renderHook(() => useComments('proposals/doc.md'), { wrapper });

    await act(async () => {
      await result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: { prefix: 'camera should ', suffix: ' during preview' },
        author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
        body: 'Question',
        resolved: false,
      });
    });

    expect(createFile).toHaveBeenCalledWith(
      'proposals/doc.comments.json',
      expect.stringContaining('"version":1'),
      'Add comment on doc.md',
    );
    expect(createFile.mock.calls[0]?.[1]).toContain('"body":"Question"');
  });

  it('appends a reply to an existing thread and updates the file', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'comments-sha',
      content: JSON.stringify({
        version: 1,
        comments: [
          {
            id: 'thread-1',
            quote: 'initialize lazily',
            quoteContext: { prefix: '', suffix: '' },
            author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
            body: 'Question',
            createdAt: '2026-06-21T05:00:00Z',
            resolved: false,
            replies: [],
          },
        ],
      }),
    });
    updateFile.mockResolvedValueOnce({ sha: 'updated-sha' });

    const { result } = renderHook(() => useComments('proposals/doc.md'), { wrapper });

    await act(async () => {
      await result.current.addReply('thread-1', {
        author: { login: 'asmith', avatarUrl: 'https://example.com/avatar-2.png' },
        body: 'Answer',
      });
    });

    expect(updateFile).toHaveBeenCalledWith(
      'proposals/doc.comments.json',
      expect.stringContaining('"body":"Answer"'),
      'comments-sha',
      'Reply to comment on doc.md',
    );
  });

  it('toggles the resolved flag on an existing thread', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'comments-sha',
      content: JSON.stringify({
        version: 1,
        comments: [
          {
            id: 'thread-1',
            quote: 'initialize lazily',
            quoteContext: { prefix: '', suffix: '' },
            author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
            body: 'Question',
            createdAt: '2026-06-21T05:00:00Z',
            resolved: false,
            replies: [],
          },
        ],
      }),
    });
    updateFile.mockResolvedValueOnce({ sha: 'updated-sha' });

    const { result } = renderHook(() => useComments('proposals/doc.md'), { wrapper });

    await act(async () => {
      await result.current.resolveThread('thread-1');
    });

    expect(updateFile).toHaveBeenCalledWith(
      'proposals/doc.comments.json',
      expect.stringContaining('"resolved":true'),
      'comments-sha',
      'Resolve comment on doc.md',
    );
  });

  it('surfaces the refresh-and-retry message for conflicts', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockRejectedValueOnce(new Error('GitHub content SHA conflict'));

    const { result } = renderHook(() => useComments('proposals/doc.md'), { wrapper });

    await expect(
      result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
        author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
        body: 'Question',
        resolved: false,
      }),
    ).rejects.toThrow(/refresh and re-apply/i);
  });
});
