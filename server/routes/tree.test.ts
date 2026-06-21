import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGitHubApiRouter } from './index.js';

interface TreeResponse {
  documents: Array<{ path: string; type: 'blob' }>;
  underReview: Array<{ path: string; unresolvedCount: number }>;
}

describe('GitHub tree-style routes', () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'redraft-tree-'));
    await mkdir(join(basePath, 'nested'), { recursive: true });
    await mkdir(join(basePath, '.redraft', 'comments', 'nested'), {
      recursive: true,
    });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');
    await writeFile(join(basePath, 'notes.txt'), 'ignore', 'utf8');
    await writeFile(
      join(basePath, 'nested', 'api-design-v2.md'),
      '# API\n',
      'utf8',
    );
    await writeFile(
      join(basePath, '.redraft', 'comments', 'nested', 'api-design-v2.comments.json'),
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
  });

  afterEach(async () => {
    await import('node:fs/promises').then(({ rm }) =>
      rm(basePath, { recursive: true, force: true }),
    );
  });

  it('returns documents and under-review entries without a proposals prefix', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/git/trees/main?recursive=1',
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
});
