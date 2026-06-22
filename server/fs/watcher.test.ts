import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted fakes — must be declared before any vi.mock() calls.
// ---------------------------------------------------------------------------

const { getWatcher, watchMock, getFsWatcher, fsWatchMock, resetWatchers } =
  vi.hoisted(() => {
    // Simulates a chokidar FSWatcher — emits add/change/unlink/error with a
    // single path argument, matching the chokidar event contract.
    class FakeChokidarWatcher {
      readonly handlers = new Map<
        string,
        Array<(arg: string | Error) => void>
      >();
      close = vi.fn(async () => undefined);

      on(event: string, handler: (arg: string | Error) => void): this {
        const existing = this.handlers.get(event) ?? [];
        existing.push(handler);
        this.handlers.set(event, existing);
        return this;
      }

      emit(event: string, arg: string | Error): void {
        for (const h of this.handlers.get(event) ?? []) {
          h(arg);
        }
      }
    }

    // Simulates a Node.js fs.FSWatcher — its 'change' event delivers
    // (eventType, filename) and 'error' delivers (err).
    class FakeFsWatcher {
      readonly handlers = new Map<
        string,
        Array<(...args: unknown[]) => void>
      >();
      close = vi.fn();

      on(event: string, handler: (...args: unknown[]) => void): this {
        const existing = this.handlers.get(event) ?? [];
        existing.push(handler);
        this.handlers.set(event, existing);
        return this;
      }

      emit(event: string, ...args: unknown[]): void {
        for (const h of this.handlers.get(event) ?? []) {
          h(...args);
        }
      }
    }

    let chokidarWatcher: FakeChokidarWatcher | null = null;
    let fsWatcher: FakeFsWatcher | null = null;

    return {
      getWatcher: () => chokidarWatcher,
      watchMock: vi.fn(() => {
        chokidarWatcher = new FakeChokidarWatcher();
        return chokidarWatcher;
      }),
      getFsWatcher: () => fsWatcher,
      fsWatchMock: vi.fn(() => {
        fsWatcher = new FakeFsWatcher();
        return fsWatcher;
      }),
      resetWatchers: () => {
        chokidarWatcher = null;
        fsWatcher = null;
      },
    };
  });

vi.mock('chokidar', () => ({
  default: { watch: watchMock },
}));

import { startWatcher } from './watcher.js';

// ---------------------------------------------------------------------------
// Helper — overrides process.platform for the duration of a test.
// Called from three distinct sites (outer beforeEach, nested beforeEach, and
// the win32 test body) so extraction is justified by the lockstep-sites rule.
// ---------------------------------------------------------------------------
function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('startWatcher', () => {
  let basePath: string;
  let savedPlatformDescriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetWatchers();
    // Save the real platform so afterEach can restore it exactly.
    savedPlatformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      'platform',
    );
    // Default to a platform where chokidar is used — keeps existing
    // behavioral tests working without change.
    setPlatform('linux');
    basePath = await mkdtemp(join(tmpdir(), 'redraft-watch-'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(basePath, { recursive: true, force: true });
    if (savedPlatformDescriptor) {
      Object.defineProperty(process, 'platform', savedPlatformDescriptor);
    }
  });

  // -------------------------------------------------------------------------
  // Backend selection
  // -------------------------------------------------------------------------

  it('uses chokidar on unsupported platforms', () => {
    // outer beforeEach already set platform = 'linux'
    const stop = startWatcher(basePath, vi.fn());

    expect(watchMock).toHaveBeenCalledOnce();
    expect(fsWatchMock).not.toHaveBeenCalled();
    stop();
  });

  // -------------------------------------------------------------------------
  // Filtering and event semantics (chokidar path — platform = 'linux')
  // -------------------------------------------------------------------------

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

  it('returns a stop function that closes the underlying chokidar watcher', async () => {
    const onEvent = vi.fn();

    const stop = startWatcher(basePath, onEvent);
    const watcher = getWatcher();
    stop();

    expect(watcher?.close).toHaveBeenCalledOnce();
  });

  it('logs chokidar errors without throwing', () => {
    const onEvent = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const stop = startWatcher(basePath, onEvent);
    const err = new Error('ENOSPC: no space left');
    getWatcher()?.emit('error', err);

    expect(errorSpy).toHaveBeenCalledWith('[redraft] watcher error:', err);
    stop();
    errorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Native fs.watch backend (darwin / win32)
  // -------------------------------------------------------------------------

  describe('on darwin/win32 — native fs.watch backend', () => {
    beforeEach(() => {
      setPlatform('darwin');
    });

    it('uses native fs.watch on darwin, not chokidar', () => {
      const stop = startWatcher(basePath, vi.fn(), fsWatchMock);

      expect(fsWatchMock).toHaveBeenCalledWith(basePath, {
        recursive: true,
        persistent: true,
      });
      expect(watchMock).not.toHaveBeenCalled();
      stop();
    });

    it('uses native fs.watch on win32, not chokidar', () => {
      setPlatform('win32');
      const stop = startWatcher(basePath, vi.fn(), fsWatchMock);

      expect(fsWatchMock).toHaveBeenCalledWith(basePath, {
        recursive: true,
        persistent: true,
      });
      expect(watchMock).not.toHaveBeenCalled();
      stop();
    });

    it('maps rename + existing file to file:created', async () => {
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

      const stop = startWatcher(basePath, onEvent, fsWatchMock);
      // 'rename' with the file on disk → file:created
      getFsWatcher()?.emit('change', 'rename', 'proposal.md');
      await vi.advanceTimersByTimeAsync(100);

      await expect(eventSignal.promise).resolves.toMatchObject({
        type: 'file:created',
        path: 'proposal.md',
        sha: expect.stringMatching(/^[a-f0-9]{40}$/),
      });
      stop();
    });

    it('maps rename + absent file to file:deleted', async () => {
      // File was never created, so existsSync returns false.
      const eventSignal = Promise.withResolvers<{
        type: string;
        path: string;
      }>();
      const onEvent = vi.fn((event: { type: string; path: string }) => {
        eventSignal.resolve(event);
      });

      const stop = startWatcher(basePath, onEvent, fsWatchMock);
      getFsWatcher()?.emit('change', 'rename', 'gone.md');
      await vi.advanceTimersByTimeAsync(100);

      await expect(eventSignal.promise).resolves.toEqual({
        type: 'file:deleted',
        path: 'gone.md',
      });
      stop();
    });

    it('maps a change event to file:changed', async () => {
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

      const stop = startWatcher(basePath, onEvent, fsWatchMock);
      getFsWatcher()?.emit('change', 'change', 'proposal.md');
      await vi.advanceTimersByTimeAsync(100);

      await expect(eventSignal.promise).resolves.toMatchObject({
        type: 'file:changed',
        path: 'proposal.md',
        sha: expect.stringMatching(/^[a-f0-9]{40}$/),
      });
      stop();
    });

    it('silently ignores change events with a null filename', async () => {
      const onEvent = vi.fn();

      const stop = startWatcher(basePath, onEvent, fsWatchMock);
      getFsWatcher()?.emit('change', 'rename', null);
      await vi.advanceTimersByTimeAsync(100);

      expect(onEvent).not.toHaveBeenCalled();
      stop();
    });

    it('applies the same filtering rules as the chokidar path', async () => {
      await writeFile(join(basePath, 'notes.txt'), 'ignore me', 'utf8');
      const onEvent = vi.fn();

      const stop = startWatcher(basePath, onEvent, fsWatchMock);
      getFsWatcher()?.emit('change', 'change', 'notes.txt');
      await vi.advanceTimersByTimeAsync(100);

      expect(onEvent).not.toHaveBeenCalled();
      stop();
    });

    it('logs native watcher errors without throwing', () => {
      const onEvent = vi.fn();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const stop = startWatcher(basePath, onEvent, fsWatchMock);
      const err = new Error('EMFILE: too many open files');
      getFsWatcher()?.emit('error', err);

      expect(errorSpy).toHaveBeenCalledWith('[redraft] watcher error:', err);
      stop();
      errorSpy.mockRestore();
    });

    it('returns a stop function that closes the native watcher', () => {
      const stop = startWatcher(basePath, vi.fn(), fsWatchMock);
      const nativeWatcher = getFsWatcher();
      stop();

      expect(nativeWatcher?.close).toHaveBeenCalledOnce();
    });
  });
});
