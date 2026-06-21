// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFileWatcher } from '../useFileWatcher';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

function setModeMeta(content: string | null) {
  document.head
    .querySelector('meta[name="draftspace-mode"]')
    ?.remove();

  if (content) {
    const meta = document.createElement('meta');
    meta.name = 'draftspace-mode';
    meta.content = content;
    document.head.appendChild(meta);
  }
}

function wrapper({ children, client }: { children: ReactNode; client: QueryClient }) {
  return createElement(QueryClientProvider, { client }, children);
}

describe('useFileWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setModeMeta(null);
  });

  it('does nothing when local mode is not active', () => {
    const client = new QueryClient();

    renderHook(() => useFileWatcher(), {
      wrapper: ({ children }) => wrapper({ children, client }),
    });

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('invalidates content, comments, and tree queries for file events in local mode', async () => {
    setModeMeta('local');
    const client = new QueryClient();
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useFileWatcher(), {
      wrapper: ({ children }) => wrapper({ children, client }),
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0]!;

    socket.emitMessage({ type: 'file:changed', path: 'proposals/auth-overhaul.md', sha: 'abc' });
    socket.emitMessage({ type: 'file:changed', path: 'proposals/auth-overhaul.comments.json', sha: 'def' });
    socket.emitMessage({ type: 'file:created', path: 'proposals/new.md' });
    socket.emitMessage({ type: 'file:deleted', path: 'proposals/old.md' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal', 'proposals/auth-overhaul.md', 'content'],
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposal', 'proposals/auth-overhaul.md', 'comments'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['proposals', 'tree'],
    });
  });

  it('reconnects after a websocket closes using exponential backoff', async () => {
    setModeMeta('local');
    const client = new QueryClient();

    renderHook(() => useFileWatcher(), {
      wrapper: ({ children }) => wrapper({ children, client }),
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0]!.emitClose();

    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]!.emitClose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });
});
