import chokidar from 'chokidar';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import ignore, { type Ignore } from 'ignore';

import { readFile } from './operations.js';

const COMMENTS_ROOT = '.redraft/comments';
const BUILT_IN_EXCLUDES = ['.git/', '.redraft/', 'node_modules/'];

export interface FileEvent {
  type: 'file:changed' | 'file:created' | 'file:deleted';
  path: string;
  sha?: string;
}

type PendingEventType = FileEvent['type'];

function isWatchedMarkdownFile(path: string): boolean {
  return path.endsWith('.md') && !path.startsWith('.redraft/');
}

function isCommentFile(path: string): boolean {
  return path.startsWith(`${COMMENTS_ROOT}/`) && path.endsWith('.comments.json');
}

function scopeGitignorePattern(currentPath: string, pattern: string): string {
  if (!currentPath || !pattern || pattern.startsWith('#')) {
    return pattern;
  }

  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  if (!body) {
    return pattern;
  }

  const normalized = body.startsWith('/') ? body.slice(1) : body;
  return `${negated ? '!' : ''}${currentPath}/${normalized}`;
}

function addGitignoreRules(
  basePath: string,
  currentPath: string,
  matcher: Ignore,
): void {
  try {
    const content = readFileSync(resolve(basePath, currentPath, '.gitignore'), 'utf8');
    matcher.add(
      content
        .split(/\r?\n/u)
        .map((pattern) => scopeGitignorePattern(currentPath, pattern)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

function loadIgnoreMatcher(
  basePath: string,
  currentPath = '',
  matcher = ignore(),
): Ignore {
  if (!currentPath) {
    matcher.add(BUILT_IN_EXCLUDES);
  }

  addGitignoreRules(basePath, currentPath, matcher);
  const directoryPath = resolve(basePath, currentPath || '.');
  const entries = readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nextRelativePath = currentPath
      ? `${currentPath}/${entry.name}`
      : entry.name;

    if (
      matcher.ignores(nextRelativePath) ||
      matcher.ignores(`${nextRelativePath}/`)
    ) {
      continue;
    }

    loadIgnoreMatcher(basePath, nextRelativePath, matcher);
  }

  return matcher;
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
  const ignoreMatcher = loadIgnoreMatcher(basePath);

  const pendingEvents = new Map<string, PendingEventType>();
  let flushTimer: NodeJS.Timeout | undefined;

  const queueEvent = (type: PendingEventType, filePath: string) => {
    const relativePath = toRelativePath(basePath, filePath);
    if (!relativePath) {
      return;
    }

    const tracked = isCommentFile(relativePath)
      ? true
      : isWatchedMarkdownFile(relativePath) &&
        !ignoreMatcher.ignores(relativePath) &&
        !ignoreMatcher.ignores(`${relativePath}/`);

    if (!tracked) {
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
