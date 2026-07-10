import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGitHubApiRouter } from './index.js';
const execGit = promisify(execFile);

interface TreeResponse {
  documents: Array<{ path: string; type: 'blob' }>;
  underReview: Array<{ path: string; unresolvedCount: number }>;
}

async function initializeRepositoryWithSidecars(
  basePath: string,
): Promise<void> {
  await execGit('git', ['init'], { cwd: basePath });
  await execGit('git', ['config', 'user.name', 'ReDraft Test'], {
    cwd: basePath,
  });
  await execGit('git', ['config', 'user.email', 'redraft@example.com'], {
    cwd: basePath,
  });
  await execGit('git', ['add', '.'], { cwd: basePath });
  await execGit('git', ['commit', '-m', 'Initial fixtures'], {
    cwd: basePath,
  });
  await execGit('git', ['branch', '-M', 'main'], { cwd: basePath });
  await execGit('git', ['checkout', '--orphan', 'redraft'], {
    cwd: basePath,
  });
  await execGit('git', ['rm', '-rf', '--ignore-unmatch', '.'], {
    cwd: basePath,
  });
  await mkdir(join(basePath, '.redraft', 'comments', 'main', 'nested'), {
    recursive: true,
  });
  await mkdir(join(basePath, '.redraft', 'comments', 'feature--docs'), {
    recursive: true,
  });
  await writeFile(
    join(
      basePath,
      '.redraft',
      'comments',
      'main',
      'nested',
      'api-design-v2.comments.json',
    ),
    JSON.stringify({
      version: 1,
      comments: [{ id: 'thread-main', resolved: false }],
    }),
    'utf8',
  );
  await writeFile(
    join(
      basePath,
      '.redraft',
      'comments',
      'feature--docs',
      'auth-overhaul.comments.json',
    ),
    JSON.stringify({
      version: 1,
      comments: [
        { id: 'thread-feature-1', resolved: false },
        { id: 'thread-feature-2', resolved: false },
        { id: 'thread-feature-3', resolved: true },
      ],
    }),
    'utf8',
  );
  await execGit('git', ['add', '.redraft'], { cwd: basePath });
  await execGit('git', ['commit', '-m', 'Seed sidecar branch'], {
    cwd: basePath,
  });
  await execGit('git', ['checkout', 'main'], { cwd: basePath });
}

describe('GitHub tree-style routes', () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'redraft-tree-'));
    await mkdir(join(basePath, 'nested'), { recursive: true });
    await mkdir(join(basePath, '.redraft', 'comments', 'main', 'nested'), {
      recursive: true,
    });
    await mkdir(
      join(basePath, '.redraft', 'comments', 'feature--docs', 'nested'),
      {
        recursive: true,
      },
    );
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');
    await writeFile(join(basePath, 'notes.txt'), 'ignore', 'utf8');
    await writeFile(
      join(basePath, 'nested', 'api-design-v2.md'),
      '# API\n',
      'utf8',
    );
    await writeFile(
      join(
        basePath,
        '.redraft',
        'comments',
        'main',
        'nested',
        'api-design-v2.comments.json',
      ),
      JSON.stringify({
        version: 1,
        comments: [
          {
            id: 'thread-1',
            quote: 'API',
            quoteContext: { prefix: '', suffix: '' },
            author: { login: 'local-user', avatarUrl: '' },
            body: 'comment',
            createdAt: '2026-01-01T00:00:00.000Z',
            resolved: false,
            replies: [],
          },
        ],
      }),
      'utf8',
    );
    await writeFile(
      join(
        basePath,
        '.redraft',
        'comments',
        'feature--docs',
        'auth-overhaul.comments.json',
      ),
      JSON.stringify({
        version: 1,
        comments: [
          {
            id: 'thread-feature',
            quote: 'Auth',
            quoteContext: { prefix: '', suffix: '' },
            author: { login: 'local-user', avatarUrl: '' },
            body: 'branch-specific comment',
            createdAt: '2026-01-01T00:00:00.000Z',
            resolved: false,
            replies: [],
          },
        ],
      }),
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('returns documents and under-review entries without a proposals prefix', async () => {
    await initializeRepositoryWithSidecars(basePath);
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/git/trees/main?recursive=1&sidecarBranch=redraft',
    );
    const body = (await response.json()) as TreeResponse;

    expect(response.status).toBe(200);
    expect(body.documents).toEqual([
      { path: 'auth-overhaul.md', type: 'blob' },
      { path: 'nested/api-design-v2.md', type: 'blob' },
    ]);
    expect(body.underReview).toEqual([
      { path: 'nested/api-design-v2.md', unresolvedCount: 1 },
    ]);
    expect(response.headers.get('x-ratelimit-remaining')).toBe('999999');
  });

  it('scopes HEAD review entries to the active git branch', async () => {
    await initializeRepositoryWithSidecars(basePath);
    await execGit('git', ['checkout', '-b', 'feature/docs'], { cwd: basePath });
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/git/trees/HEAD?recursive=1&sidecarBranch=redraft',
    );
    const body = (await response.json()) as TreeResponse;

    expect(response.status).toBe(200);
    expect(body.underReview).toEqual([
      { path: 'auth-overhaul.md', unresolvedCount: 2 },
    ]);
  });

  it('uses main as the HEAD review namespace when git is detached', async () => {
    await initializeRepositoryWithSidecars(basePath);
    await execGit('git', ['checkout', '--detach', 'HEAD'], { cwd: basePath });
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/git/trees/HEAD?recursive=1&sidecarBranch=redraft',
    );
    const body = (await response.json()) as TreeResponse;

    expect(response.status).toBe(200);
    expect(body.underReview).toEqual([
      { path: 'nested/api-design-v2.md', unresolvedCount: 1 },
    ]);
  });

  it('uses main as the HEAD review namespace when git branch detection fails', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/git/trees/HEAD?recursive=1',
    );
    const body = (await response.json()) as TreeResponse;

    expect(response.status).toBe(200);
    expect(body.underReview).toEqual([]);
  });
});
