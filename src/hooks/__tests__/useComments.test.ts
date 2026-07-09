// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFileContent = vi.hoisted(() => vi.fn());
const createFile = vi.hoisted(() => vi.fn());
const updateFile = vi.hoisted(() => vi.fn());
const setBranch = vi.hoisted(() => vi.fn());
const setSidecarBranch = vi.hoisted(() => vi.fn());

vi.mock('../../lib/github/client', () => ({
  ConflictError: class ConflictError extends Error {},
  GitHubClient: class GitHubClient {
    getFileContent = getFileContent;
    createFile = createFile;
    updateFile = updateFile;
  },
}));

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    pat: 'ghp_test',
    repo: { owner: 'acme', repo: 'workspace' },
    branch: 'dev',
    defaultBranch: 'main',
    sidecarBranch: 'redraft',
    setBranch,
    setSidecarBranch,
  }),
}));

import { useComments } from '../useComments';

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

const EXISTING_THREAD = {
  id: 'thread-1',
  quote: 'initialize lazily',
  quoteContext: { prefix: 'camera should ', suffix: ' during preview' },
  offset: 18,
  author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
  body: 'Question',
  createdAt: '2026-06-21T05:00:00Z',
  resolved: false,
  replies: [],
};

describe('useComments – local state', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    getFileContent.mockReset();
    createFile.mockReset();
    updateFile.mockReset();
    setBranch.mockReset();
    setSidecarBranch.mockReset();
  });

  it('starts empty and not dirty when no comments file exists', async () => {
    getFileContent.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.threads).toEqual([]);
    expect(result.current.isDirty).toBe(false);
    expect(getFileContent).toHaveBeenCalledWith(
      '.redraft/comments/dev/docs/doc.comments.json',
      { optional: true, ref: 'redraft' },
    );
    expect(
      queryClient.getQueryState([
        'document',
        'docs/doc.md',
        'comments',
        'dev',
        'redraft',
      ]),
    ).toBeDefined();
  });

  it('seeds threads from an existing comments file on load', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0]?.id).toBe('thread-1');
    expect(result.current.isDirty).toBe(false);
  });

  it('addComment stores the provided rendered-text offset on the new thread without any API call', async () => {
    getFileContent.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
        offset: 18,
        author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
        body: 'Question',
        resolved: false,
      });
    });

    expect(result.current.threads).toHaveLength(1);
    expect(result.current.threads[0]).toEqual(
      expect.objectContaining({
        quote: 'initialize lazily',
        body: 'Question',
        offset: 18,
      }),
    );
    expect(result.current.isDirty).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('addReply appends a reply locally without any API call', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
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

  it('deleteThread removes a thread locally and marks dirty without any API call', async () => {
    const otherThread = {
      ...EXISTING_THREAD,
      id: 'thread-2',
      quote: 'keep this one',
      body: 'Keep me',
      createdAt: '2026-06-21T06:00:00Z',
    };

    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({
        version: 1,
        comments: [EXISTING_THREAD, otherThread],
      }),
    });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.deleteThread('thread-1');
    });

    expect(result.current.threads).toEqual([otherThread]);
    expect(result.current.isDirty).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('deleteReply removes a single reply locally and marks dirty without any API call', async () => {
    const firstReply = {
      id: 'reply-1',
      author: { login: 'asmith', avatarUrl: 'https://example.com/a1.png' },
      body: 'First reply',
      createdAt: '2026-06-21T05:10:00Z',
    };
    const secondReply = {
      id: 'reply-2',
      author: { login: 'bsmith', avatarUrl: 'https://example.com/a2.png' },
      body: 'Second reply',
      createdAt: '2026-06-21T05:20:00Z',
    };
    const threadWithReplies = {
      ...EXISTING_THREAD,
      replies: [firstReply, secondReply],
    };

    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({
        version: 1,
        comments: [threadWithReplies],
      }),
    });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.deleteReply('thread-1', 'reply-1');
    });

    expect(result.current.threads).toEqual([
      {
        ...threadWithReplies,
        replies: [secondReply],
      },
    ]);
    expect(result.current.isDirty).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('deleteReply on an unknown thread or reply leaves threads unchanged and marks dirty', async () => {
    const onlyReply = {
      id: 'reply-1',
      author: { login: 'asmith', avatarUrl: 'https://example.com/a1.png' },
      body: 'Only reply',
      createdAt: '2026-06-21T05:10:00Z',
    };
    const seededThreads = [
      {
        ...EXISTING_THREAD,
        replies: [onlyReply],
      },
    ];

    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: seededThreads }),
    });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.deleteReply('missing-thread', 'reply-404');
    });

    expect(result.current.threads).toEqual(seededThreads);
    expect(result.current.isDirty).toBe(true);
    expect(createFile).not.toHaveBeenCalled();
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('resolveThread toggles resolved flag locally without any API call', async () => {
    getFileContent.mockResolvedValueOnce({
      sha: 'sha-123',
      content: JSON.stringify({ version: 1, comments: [EXISTING_THREAD] }),
    });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
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
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    getFileContent.mockReset();
    createFile.mockReset();
    updateFile.mockReset();
    setBranch.mockReset();
    setSidecarBranch.mockReset();
  });

  it('calls createFile when no comments file exists yet', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockResolvedValueOnce({ sha: 'new-sha' });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
        offset: 18,
        author: { login: 'jdoe', avatarUrl: '' },
        body: 'Question',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(createFile).toHaveBeenCalledWith(
      '.redraft/comments/dev/docs/doc.comments.json',
      expect.stringContaining('"body":"Question"'),
      'Add comments on doc.md',
      'redraft',
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

    const { result } = renderHook(() => useComments('docs/doc.md'), {
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
      '.redraft/comments/dev/docs/doc.comments.json',
      expect.stringContaining('"resolved":true'),
      'load-sha',
      'Update comments on doc.md',
      'redraft',
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('persists deleted threads when saving with an existing SHA', async () => {
    const otherThread = {
      ...EXISTING_THREAD,
      id: 'thread-2',
      quote: 'keep this one',
      body: 'Keep me',
      createdAt: '2026-06-21T06:00:00Z',
    };

    getFileContent.mockResolvedValueOnce({
      sha: 'load-sha',
      content: JSON.stringify({
        version: 1,
        comments: [EXISTING_THREAD, otherThread],
      }),
    });
    updateFile.mockResolvedValueOnce({ sha: 'updated-sha' });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.deleteThread('thread-1');
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(updateFile).toHaveBeenCalledTimes(1);
    const [path, content, sha, message, branch] = updateFile.mock.calls[0];
    expect(path).toBe('.redraft/comments/dev/docs/doc.comments.json');
    expect(sha).toBe('load-sha');
    expect(message).toBe('Update comments on doc.md');
    expect(branch).toBe('redraft');
    expect(JSON.parse(content)).toEqual({
      version: 1,
      comments: [otherThread],
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('clears isDirty and retains new SHA after a successful save', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockResolvedValueOnce({ sha: 'created-sha' });
    updateFile.mockResolvedValueOnce({ sha: 'second-sha' });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'a',
        quoteContext: { prefix: '', suffix: '' },
        offset: 0,
        author: { login: 'u', avatarUrl: '' },
        body: 'first',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.addComment({
        quote: 'b',
        quoteContext: { prefix: '', suffix: '' },
        offset: 1,
        author: { login: 'u', avatarUrl: '' },
        body: 'second',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(updateFile).toHaveBeenCalledWith(
      '.redraft/comments/dev/docs/doc.comments.json',
      expect.stringContaining('"body":"second"'),
      'created-sha',
      'Update comments on doc.md',
      'redraft',
    );
  });

  it('surfaces the refresh-and-retry message for SHA conflicts', async () => {
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockRejectedValueOnce(new Error('GitHub content SHA conflict'));

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'a',
        quoteContext: { prefix: '', suffix: '' },
        offset: 0,
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

  it('updates the TanStack Query cache after a first-write so SPA navigation back seeds correctly', async () => {
    // Regression: with staleTime: Infinity, the cache holds the null from the
    // initial 404 forever. Navigating away resets localThreads; navigating back
    // seeds from the stale null rather than the just-saved content. The fix
    // calls queryClient.setQueryData after every successful write.
    getFileContent.mockResolvedValueOnce(null);
    createFile.mockResolvedValueOnce({ sha: 'first-write-sha' });

    const { result } = renderHook(() => useComments('docs/doc.md'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addComment({
        quote: 'initialize lazily',
        quoteContext: {
          prefix: 'The camera should ',
          suffix: ' when preview starts.',
        },
        offset: 18,
        author: { login: 'jdoe', avatarUrl: '' },
        body: 'First comment',
        resolved: false,
      });
    });

    await act(async () => {
      await result.current.saveComments();
    });

    expect(result.current.isDirty).toBe(false);

    // The query cache must now hold the written content so that when the
    // component remounts (path change + back) it seeds from real data.
    const cached = queryClient.getQueryData([
      'document',
      'docs/doc.md',
      'comments',
      'dev', // branch from useAuth mock
      'redraft', // sidecarBranch from useAuth mock
    ]) as { sha: string; content: string } | null;

    expect(cached).not.toBeNull();
    expect(cached?.sha).toBe('first-write-sha');
    const parsed = JSON.parse(cached?.content ?? '{}') as {
      comments?: Array<{ body?: string }>;
    };
    expect(
      parsed.comments?.find((c) => c.body === 'First comment'),
    ).toBeTruthy();
  });
});
