import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import type { Hono } from 'hono';

import { execGitText } from '../fs/git-exec.js';
import { FileOperationError } from '../types.js';
import type { RouteHelpers } from './user.js';

interface GitRequestBody {
  message?: string;
}

interface GitCommitResponse {
  sha: string | null;
  message: string;
  sidecar?: { sha: string; message: string };
}

export interface GitRouteHelpers extends RouteHelpers {
  basePath: string;
  sidecarBranch?: string;
}

interface RepoContext {
  repoRoot: string;
  relativeScope: string;
}

interface ExecGitOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

async function execGit(
  command: 'git',
  args: string[],
  options: ExecGitOptions,
): Promise<{ stdout: string }> {
  void command;
  return { stdout: await execGitText(options.cwd, args, { env: options.env }) };
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
  return `Update documents via ReDraft (${new Date().toISOString()})`;
}

function sidecarScope(relativeScope: string): string {
  return relativeScope === '.' ? '.redraft' : `${relativeScope}/.redraft`;
}

function sidecarExcludePathspec(relativeScope: string): string {
  return relativeScope === '.' ? ':!.redraft/' : `:!${relativeScope}/.redraft/`;
}

async function hasStagedChanges(
  repoRoot: string,
  pathspecs: string[],
): Promise<boolean> {
  try {
    await execGit('git', ['diff', '--cached', '--quiet', '--', ...pathspecs], {
      cwd: repoRoot,
    });
    return false;
  } catch {
    return true;
  }
}

async function refExists(
  repoRoot: string,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await execGit(
      'git',
      ['rev-parse', '--verify', `refs/heads/${ref}`],
      { cwd: repoRoot },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

function parseStatusPaths(
  stdout: string,
): Array<{ code: string; path: string }> {
  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({ code: line.slice(0, 2), path: line.slice(3).trim() }));
}

async function commitSidecars(
  repoRoot: string,
  relativeScope: string,
  branch: string,
): Promise<{ sha: string; message: string } | null> {
  const scope = sidecarScope(relativeScope);
  const { stdout } = await execGit(
    'git',
    ['status', '--porcelain', '-uall', '--', scope],
    { cwd: repoRoot },
  );
  const changed = parseStatusPaths(stdout);
  if (changed.length === 0) {
    return null;
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'redraft-index-'));
  const indexPath = join(tempDir, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  const parent = await refExists(repoRoot, branch);
  const message = 'Update review comments';

  try {
    if (parent) {
      await execGit('git', ['read-tree', branch], { cwd: repoRoot, env });
    }

    for (const entry of changed) {
      if (entry.code.includes('D')) {
        await execGit('git', ['update-index', '--force-remove', entry.path], {
          cwd: repoRoot,
          env,
        });
        continue;
      }

      const { stdout: blob } = await execGit(
        'git',
        ['hash-object', '-w', entry.path],
        { cwd: repoRoot },
      );
      await execGit(
        'git',
        [
          'update-index',
          '--add',
          '--cacheinfo',
          `100644,${blob.trim()},${entry.path}`,
        ],
        { cwd: repoRoot, env },
      );
    }

    const { stdout: tree } = await execGit('git', ['write-tree'], {
      cwd: repoRoot,
      env,
    });
    if (parent) {
      const { stdout: parentTree } = await execGit(
        'git',
        ['rev-parse', `${parent}^{tree}`],
        { cwd: repoRoot },
      );
      if (tree.trim() === parentTree.trim()) {
        return null;
      }
    }
    const commitArgs = ['commit-tree', tree.trim(), '-m', message];
    if (parent) {
      commitArgs.push('-p', parent);
    }
    const commitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: 'ReDraft',
      GIT_AUTHOR_EMAIL: 'redraft@local',
      GIT_COMMITTER_NAME: 'ReDraft',
      GIT_COMMITTER_EMAIL: 'redraft@local',
    };
    const { stdout: commit } = await execGit('git', commitArgs, {
      cwd: repoRoot,
      env: commitEnv,
    });
    const sha = commit.trim();
    await execGit('git', ['update-ref', `refs/heads/${branch}`, sha], {
      cwd: repoRoot,
    });

    return { sha, message };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function registerGitRoute(app: Hono, helpers: GitRouteHelpers): void {
  app.get('/api/git/branch', async () => {
    const { repoRoot } = await getRepoContext(helpers.basePath);
    const { stdout } = await execGit(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: repoRoot },
    );
    const branch = stdout.trim();
    return helpers.json({ branch: branch === 'HEAD' ? 'main' : branch });
  });

  app.get('/api/git/status', async () => {
    const { repoRoot, relativeScope } = await getRepoContext(helpers.basePath);
    const { stdout } = await execGit(
      'git',
      [
        'status',
        '--porcelain',
        '--',
        relativeScope,
        sidecarExcludePathspec(relativeScope),
      ],
      { cwd: repoRoot },
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
    const excludeSidecars = sidecarExcludePathspec(relativeScope);

    await execGit('git', ['add', '--', relativeScope, excludeSidecars], {
      cwd: repoRoot,
    });

    let sha: string | null = null;
    if (await hasStagedChanges(repoRoot, [relativeScope, excludeSidecars])) {
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
          '--',
          relativeScope,
          excludeSidecars,
        ],
        { cwd: repoRoot },
      );

      const result = await execGit('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
      });
      sha = result.stdout.trim();
    }

    const sidecar = await commitSidecars(
      repoRoot,
      relativeScope,
      helpers.sidecarBranch ?? 'redraft',
    );
    const response: GitCommitResponse = { sha, message };
    if (sidecar) {
      response.sidecar = sidecar;
    }
    return helpers.json(response);
  });
}
