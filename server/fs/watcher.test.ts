import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    basePath = await mkdtemp(join(tmpdir(), 'redraft-watch-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(basePath, { recursive: true, force: true });
  });

  it('emits a file:changed event with a sha for markdown updates', async () => {
    const filePath = join(basePath, 'proposal.md');
    await writeFile(filePath, '# Proposal\n', 'utf8');
    const eventSignal = Promise.withResolvers<{
      type: string;
      path: string;
      sha?: string;
    }>();
    const onEvent = vi.fn(
      (event: { type: string; path: string; sha?: string }) => {
        eventSignal.resolve(event);
      },
    );

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

  it('emits file events for markdown files and centralized comment sidecars', async () => {
    const filePath = join(basePath, 'proposal.md');
    const commentPath = join(
      basePath,
      '.redraft',
      'comments',
      'proposal.comments.json',
    );
    await mkdir(join(basePath, '.redraft', 'comments'), { recursive: true });
    await writeFile(filePath, '# Proposal\n', 'utf8');
    await writeFile(commentPath, '{"version":1,"comments":[]}', 'utf8');
    const firstEvent = Promise.withResolvers<{
      type: string;
      path: string;
      sha?: string;
    }>();
    const secondEvent = Promise.withResolvers<{
      type: string;
      path: string;
      sha?: string;
    }>();
    const thirdEvent = Promise.withResolvers<{
      type: string;
      path: string;
      sha?: string;
    }>();
    let eventCount = 0;

    const stop = startWatcher(basePath, (event) => {
      if (eventCount === 0) {
        firstEvent.resolve(event);
      } else if (eventCount === 1) {
        secondEvent.resolve(event);
      } else {
        thirdEvent.resolve(event);
      }
      eventCount += 1;
    });

    getWatcher()?.emit('add', filePath);
    await vi.advanceTimersByTimeAsync(100);
    await expect(firstEvent.promise).resolves.toMatchObject({
      type: 'file:created',
      path: 'proposal.md',
      sha: expect.stringMatching(/^[a-f0-9]{40}$/),
    });

    getWatcher()?.emit('change', commentPath);
    await vi.advanceTimersByTimeAsync(100);
    await expect(secondEvent.promise).resolves.toMatchObject({
      type: 'file:changed',
      path: '.redraft/comments/proposal.comments.json',
      sha: expect.stringMatching(/^[a-f0-9]{40}$/),
    });

    getWatcher()?.emit('unlink', commentPath);
    await vi.advanceTimersByTimeAsync(100);
    await expect(thirdEvent.promise).resolves.toEqual({
      type: 'file:deleted',
      path: '.redraft/comments/proposal.comments.json',
    });

    stop();
  });

  it('ignores non-document files and markdown inside excluded directories', async () => {
    const textPath = join(basePath, 'notes.txt');
    const nodeModulesPath = join(basePath, 'node_modules', 'pkg', 'README.md');
    const redraftMarkdownPath = join(basePath, '.redraft', 'notes.md');
    await mkdir(join(basePath, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(basePath, '.redraft'), { recursive: true });
    await writeFile(textPath, 'ignore me', 'utf8');
    await writeFile(nodeModulesPath, '# Package\n', 'utf8');
    await writeFile(redraftMarkdownPath, '# Metadata\n', 'utf8');
    const onEvent = vi.fn();

    const stop = startWatcher(basePath, onEvent);
    getWatcher()?.emit('change', textPath);
    getWatcher()?.emit('change', nodeModulesPath);
    getWatcher()?.emit('change', redraftMarkdownPath);
    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).not.toHaveBeenCalled();
    stop();
  });

  it('ignores markdown files excluded by gitignore rules', async () => {
    const hiddenPath = join(basePath, 'ignored', 'hidden.md');
    await mkdir(join(basePath, 'ignored'), { recursive: true });
    await writeFile(join(basePath, '.gitignore'), 'ignored/\n', 'utf8');
    await writeFile(hiddenPath, '# Hidden\n', 'utf8');
    const onEvent = vi.fn();

    const stop = startWatcher(basePath, onEvent);
    getWatcher()?.emit('change', hiddenPath);
    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).not.toHaveBeenCalled();
    stop();
  });

  it('debounces repeated writes for the same path into one event', async () => {
    const filePath = join(basePath, 'proposal.md');
    await writeFile(filePath, '# Proposal\n', 'utf8');
    const eventSignal = Promise.withResolvers<{
      type: string;
      path: string;
      sha?: string;
    }>();
    const onEvent = vi.fn(
      (event: { type: string; path: string; sha?: string }) => {
        eventSignal.resolve(event);
      },
    );

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
