import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGitHubApiRouter } from './index.js';

interface TreeResponse {
  tree: Array<{ path: string; type: 'blob' }>;
}

describe('GitHub tree-style routes', () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'draftspace-tree-'));
    await mkdir(join(basePath, 'nested'), { recursive: true });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');
    await writeFile(
      join(basePath, 'auth-overhaul.comments.json'),
      '{"version":1,"comments":[]}',
      'utf8',
    );
    await writeFile(join(basePath, 'notes.txt'), 'ignore', 'utf8');
    await writeFile(
      join(basePath, 'nested', 'api-design-v2.md'),
      '# API\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await import('node:fs/promises').then(({ rm }) =>
      rm(basePath, { recursive: true, force: true }),
    );
  });

  it('returns proposal and comments files under the proposals/ prefix', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/git/trees/main?recursive=1',
    );
    const body = (await response.json()) as TreeResponse;

    expect(response.status).toBe(200);
    expect(body.tree).toEqual([
      { path: 'proposals/auth-overhaul.comments.json', type: 'blob' },
      { path: 'proposals/auth-overhaul.md', type: 'blob' },
      { path: 'proposals/nested/api-design-v2.md', type: 'blob' },
    ]);
    expect(response.headers.get('x-ratelimit-remaining')).toBe('999999');
  });
});
