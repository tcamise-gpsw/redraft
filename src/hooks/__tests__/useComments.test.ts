// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
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
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
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

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(AuthProvider, null, children),
  );
}

const EXISTING_THREAD = {
  id: 'thread-1',
  quote: 'initialize lazily',
  quoteContext: { prefix: 'camera should ', suffix: ' during preview' },
  author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
  body: 'Question',
  createdAt: '2026-06-21T05:00:00Z',
  resolved: false,
  replies: [],
};

describe('useComments – local state', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    getFileContent.mockReset();
    createFile.mockReset();
    updateFile.mockReset();
  });

  it('starts empty and not dirty when no comments file exists', async () => {
    getFileContent.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.threads).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it('seeds threads from an existing comments file on load', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0]?.id).toBe('thread-1');
    expect(result.current.isDirty).toBe(false);
  });

  it('addComment appends a thread locally without any API call', async () => {
    getFileContent.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
        author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
        body: 'Question',
        resolved: false,
      });
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0]?.body).toBe('Question');
    expect(result.current.isDirty).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('addReply appends a reply locally without any API call', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addReply('thread-1', {
        author: { login: 'asmith', avatarUrl: 'https://example.com/a2.png' },
        body: 'Answer',
      });
    });

    expect(result.current.threads[0]?.replies).toHaveLength(1);
    expect(result.current.threads[0]?.replies[0]?.body).toBe('Answer');
    expect(result.current.isDirty).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('resolveThread toggles resolved flag locally without any API call', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.resolveThread('thread-1');
    });

    expect(result.current.threads[0]?.resolved).toBe(true);
    expect(result.current.isDirty).toBe(true);
    expect(updateFile).not.toHaveBeenCalled();
  });
});

describe('useComments – saveComments', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    getFileContent.mockReset();
    createFile.mockReset();
    updateFile.mockReset();
  });

  it('calls createFile when no comments file exists yet', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockResolvedValueOnce({ sha: 'new-sha' });

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
        author: { login: 'jdoe', avatarUrl: '' },
        body: 'Question',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(createFile).toHaveBeenCalledWith(
      'proposals/doc.comments.json',
      expect.stringContaining('"body":"Question"'),
      'Add comments on doc.md',
    );
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it('calls updateFile using the SHA from the initial load', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'load-sha',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });
    updateFile.mockResolvedValueOnce({ sha: 'updated-sha' });

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.resolveThread('thread-1');
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(updateFile).toHaveBeenCalledWith(
      'proposals/doc.comments.json',
      expect.stringContaining('"resolved":true'),
      'load-sha',
      'Update comments on doc.md',
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('clears isDirty and retains new SHA after a successful save', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockResolvedValueOnce({ sha: 'created-sha' });
    updateFile.mockResolvedValueOnce({ sha: 'second-sha' });

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'a',
        quoteContext: { prefix: '', suffix: '' },
        author: { login: 'u', avatarUrl: '' },
        body: 'first',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(result.current.isDirty).toBe(false);

    // Second mutation + save should use the SHA from the first save
    act(() => {
      result.current.addComment({
        quote: 'b',
        quoteContext: { prefix: '', suffix: '' },
        author: { login: 'u', avatarUrl: '' },
        body: 'second',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(updateFile).toHaveBeenCalledWith(
      'proposals/doc.comments.json',
      expect.stringContaining('"body":"second"'),
      'created-sha',
      'Update comments on doc.md',
    );
  });

  it('surfaces the refresh-and-retry message for SHA conflicts', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockRejectedValueOnce(new Error('GitHub content SHA conflict'));

    const { result } = renderHook(() => useComments('proposals/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'a',
        quoteContext: { prefix: '', suffix: '' },
        author: { login: 'u', avatarUrl: '' },
        body: 'Q',
        resolved: false,
      });
    });

    let caughtError: Error | undefined;
    await act(async () => {
      try {
        await result.current.saveComments();
      } catch (e) {
        caughtError = e instanceof Error ? e : new Error(String(e));
      }
    });

    expect(caughtError?.message).toMatch(/refresh and re-apply/i);
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSaving).toBe(false);
  });
});
