import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getWatcher, watchMock } = vi.hoisted(() => {
  class FakeWatcher {
    readonly handlers = new Map<string, Array<(path: string) => void>>();
    close = vi.fn(async () => undefined);

    on(event: string, handler: (path: string) => void): this {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
      return this;
    }

    emit(event: string, path: string): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(path);
      }
    }
  }

  let watcher: FakeWatcher | null = null;

  return {
    getWatcher: () => watcher,
    watchMock: vi.fn(() => {
      watcher = new FakeWatcher();
      return watcher;
    }),
  };
});

vi.mock('chokidar', () => ({
  default: { watch: watchMock },
}));

import { startWatcher } from './watcher.js';

describe('startWatcher', () => {
  let basePath: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    basePath = await mkdtemp(join(tmpdir(), 'draftspace-watch-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(basePath, { recursive: true, force: true });
  });

  it('emits a file:changed event with a sha for markdown updates', async () => {
    const filePath = join(basePath, 'proposal.md');
    await writeFile(filePath, '# Proposal\n', 'utf8');
    const eventSignal = Promise.withResolvers<{ type: string; path: string; sha?: string }>();
    const onEvent = vi.fn((event: { type: string; path: string; sha?: string }) => {
      eventSignal.resolve(event);
    });

    const stop = startWatcher(basePath, onEvent);
    getWatcher()?.emit('change', filePath);
    await vi.advanceTimersByTimeAsync(100);

    await expect(eventSignal.promise).resolves.toMatchObject({
      type: 'file:changed',
      path: 'proposal.md',
      sha: expect.stringMatching(/^[a-f0-9]{40}$/),
    });

    stop();
  });

  it('emits file:created and file:deleted events for tracked files', async () => {
    const filePath = join(basePath, 'proposal.md');
    await writeFile(filePath, '# Proposal\n', 'utf8');
    const firstEvent = Promise.withResolvers<{ type: string; path: string; sha?: string }>();
    const secondEvent = Promise.withResolvers<{ type: string; path: string; sha?: string }>();
    let eventCount = 0;
    const onEvent = vi.fn((event: { type: string; path: string; sha?: string }) => {
      if (eventCount === 0) {
        firstEvent.resolve(event);
      } else {
        secondEvent.resolve(event);
      }
      eventCount += 1;
    });

    const stop = startWatcher(basePath, onEvent);
    getWatcher()?.emit('add', filePath);
    await vi.advanceTimersByTimeAsync(100);
    await expect(firstEvent.promise).resolves.toMatchObject({
      type: 'file:created',
      path: 'proposal.md',
      sha: expect.stringMatching(/^[a-f0-9]{40}$/),
    });

    getWatcher()?.emit('unlink', filePath);
    await vi.advanceTimersByTimeAsync(100);
    await expect(secondEvent.promise).resolves.toEqual({
      type: 'file:deleted',
      path: 'proposal.md',
    });

    stop();
  });

  it('ignores non proposal files', async () => {
    const filePath = join(basePath, 'notes.txt');
    await writeFile(filePath, 'ignore me', 'utf8');
    const onEvent = vi.fn();

    const stop = startWatcher(basePath, onEvent);
    getWatcher()?.emit('change', filePath);
    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).not.toHaveBeenCalled();
    stop();
  });

  it('debounces repeated writes for the same path into one event', async () => {
    const filePath = join(basePath, 'proposal.md');
    await writeFile(filePath, '# Proposal\n', 'utf8');
    const eventSignal = Promise.withResolvers<{ type: string; path: string; sha?: string }>();
    const onEvent = vi.fn((event: { type: string; path: string; sha?: string }) => {
      eventSignal.resolve(event);
    });

    const stop = startWatcher(basePath, onEvent);
    getWatcher()?.emit('change', filePath);
    getWatcher()?.emit('change', filePath);
    getWatcher()?.emit('change', filePath);
    await vi.advanceTimersByTimeAsync(100);
    await eventSignal.promise;

    expect(onEvent).toHaveBeenCalledTimes(1);
    stop();
  });

  it('returns a stop function that closes the underlying watcher', async () => {
    const onEvent = vi.fn();

    const stop = startWatcher(basePath, onEvent);
    const watcher = getWatcher();
    stop();

    expect(watcher?.close).toHaveBeenCalledOnce();
  });
});
