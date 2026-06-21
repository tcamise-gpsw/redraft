import chokidar from 'chokidar';
import { relative, resolve } from 'node:path';

import { readFile } from './operations.js';

export interface FileEvent {
  type: 'file:changed' | 'file:created' | 'file:deleted';
  path: string;
  sha?: string;
}

type PendingEventType = FileEvent['type'];

function isTrackedProposalFile(path: string): boolean {
  return path.endsWith('.md') || path.endsWith('.comments.json');
}

function toRelativePath(basePath: string, filePath: string): string | null {
  const resolvedBase = resolve(basePath);
  const resolvedFile = resolve(filePath);
  const relativePath = relative(resolvedBase, resolvedFile);

  if (relativePath === '' || relativePath.startsWith('..')) {
    return null;
  }

  return relativePath;
}

export function startWatcher(
  basePath: string,
  onEvent: (event: FileEvent) => void,
): () => void {
  const watcher = chokidar.watch(basePath, {
    ignoreInitial: true,
    persistent: true,
  });

  const pendingEvents = new Map<string, PendingEventType>();
  let flushTimer: NodeJS.Timeout | undefined;

  const queueEvent = (type: PendingEventType, filePath: string) => {
    const relativePath = toRelativePath(basePath, filePath);
    if (!relativePath || !isTrackedProposalFile(relativePath)) {
      return;
    }

    const previousType = pendingEvents.get(relativePath);
    if (previousType === 'file:created' && type === 'file:changed') {
      pendingEvents.set(relativePath, previousType);
    } else {
      pendingEvents.set(relativePath, type);
    }

    clearTimeout(flushTimer);

    flushTimer = setTimeout(async () => {
      flushTimer = undefined;
      const currentBatch = Array.from(pendingEvents.entries());
      pendingEvents.clear();

      for (const [path, eventType] of currentBatch) {
        if (eventType === 'file:deleted') {
          onEvent({ type: eventType, path });
          continue;
        }

        try {
          const file = await readFile(basePath, path);
          onEvent({ type: eventType, path, sha: file.sha });
        } catch {
          // File disappeared between the fs event and the flush — skip it.
        }
      }
    }, 100);
  };

  watcher.on('add', (filePath) => queueEvent('file:created', filePath));
  watcher.on('change', (filePath) => queueEvent('file:changed', filePath));
  watcher.on('unlink', (filePath) => queueEvent('file:deleted', filePath));

  return () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
    void watcher.close();
  };
}
