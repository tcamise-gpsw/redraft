import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { relative } from 'node:path';
import { promisify } from 'node:util';

import type { Hono } from 'hono';

import { FileOperationError } from '../types.js';
import type { RouteHelpers } from './user.js';

const execGit = promisify(execFile);

interface GitRequestBody {
  message?: string;
}

export interface GitRouteHelpers extends RouteHelpers {
  basePath: string;
}

interface RepoContext {
  repoRoot: string;
  relativeScope: string;
}

async function getRepoContext(basePath: string): Promise<RepoContext> {
  try {
    const { stdout } = await execGit('git', ['rev-parse', '--show-toplevel'], {
      cwd: basePath,
    });
    const repoRoot = await realpath(stdout.trim());
    const resolvedBasePath = await realpath(basePath);
    return {
      repoRoot,
      relativeScope: relative(repoRoot, resolvedBasePath) || '.',
    };
  } catch {
    throw new FileOperationError(404, 'Not a git repository.');
  }
}

function mapStatus(code: string): 'modified' | 'untracked' | 'deleted' {
  if (code === '??') {
    return 'untracked';
  }

  if (code.includes('D')) {
    return 'deleted';
  }

  return 'modified';
}

function defaultCommitMessage(): string {
  return `Update proposals via ReDraft (${new Date().toISOString()})`;
}

export function registerGitRoute(app: Hono, helpers: GitRouteHelpers): void {
  app.get('/api/git/status', async () => {
    const { repoRoot, relativeScope } = await getRepoContext(helpers.basePath);
    const { stdout } = await execGit(
      'git',
      ['status', '--porcelain', '--', relativeScope],
      {
        cwd: repoRoot,
      },
    );

    const files = stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => ({
        path: line.slice(3).trim(),
        status: mapStatus(line.slice(0, 2)),
      }));

    return helpers.json({ dirty: files.length > 0, files });
  });

  app.post('/api/git/commit', async (c) => {
    const body = (await c.req.json()) as GitRequestBody;
    const message = body.message?.trim() || defaultCommitMessage();
    const { repoRoot, relativeScope } = await getRepoContext(helpers.basePath);

    await execGit('git', ['add', '--', relativeScope], { cwd: repoRoot });
    await execGit(
      'git',
      [
        '-c',
        'user.name=ReDraft',
        '-c',
        'user.email=redraft@local',
        'commit',
        '-m',
        message,
      ],
      { cwd: repoRoot },
    );

    const { stdout } = await execGit('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
    });
    return helpers.json({ sha: stdout.trim(), message });
  });
}
