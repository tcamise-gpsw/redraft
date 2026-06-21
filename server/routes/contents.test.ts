import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGitHubApiRouter } from './index.js';

interface UserResponse {
  login: string;
  avatar_url: string;
}

interface FileResponse {
  type: 'file';
  sha: string;
  content: string;
}

interface WriteResponse {
  content: { sha: string };
}

interface ErrorResponse {
  message: string;
}

interface CommitResponse {
  commit: {
    message: string;
    author: { date: string };
  };
  author: {
    login: string;
    avatar_url: string;
  };
}

describe('GitHub contents-style routes', () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'redraft-routes-'));
    await mkdir(join(basePath, 'nested'), { recursive: true });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');
  });

  afterEach(async () => {
    await import('node:fs/promises').then(({ rm }) =>
      rm(basePath, { recursive: true, force: true }),
    );
  });

  it('returns the local user identity', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/github/user');
    const body = (await response.json()) as UserResponse;

    expect(response.status).toBe(200);
    expect(body).toEqual({ login: 'local-user', avatar_url: '' });
    expect(response.headers.get('x-ratelimit-remaining')).toBe('999999');
  });

  it('returns base64-encoded file content and sha for proposal files', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/contents/proposals/auth-overhaul.md',
    );
    const body = (await response.json()) as FileResponse;

    expect(response.status).toBe(200);
    expect(body.type).toBe('file');
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(
      '# Auth\n',
    );
    expect(body.sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('updates proposal content when the incoming sha matches', async () => {
    const app = buildGitHubApiRouter(basePath);
    const existing = await app.request(
      'http://local.test/api/github/repos/local/proposals/contents/proposals/auth-overhaul.md',
    );
    const existingBody = (await existing.json()) as FileResponse;

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/contents/proposals/auth-overhaul.md',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Update proposal',
          sha: existingBody.sha,
          content: Buffer.from('# Updated\n', 'utf8').toString('base64'),
        }),
      },
    );
    const body = (await response.json()) as WriteResponse;

    expect(response.status).toBe(200);
    expect(body.content.sha).toMatch(/^[a-f0-9]{40}$/);
    await expect(
      readFile(join(basePath, 'auth-overhaul.md'), 'utf8'),
    ).resolves.toBe('# Updated\n');
  });

  it('returns 409 when a PUT request uses a stale sha', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/contents/proposals/auth-overhaul.md',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Update proposal',
          sha: 'stale-sha',
          content: Buffer.from('# Updated\n', 'utf8').toString('base64'),
        }),
      },
    );
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body.message).toMatch(/conflict/i);
  });

  it('creates a missing file when PUT is sent without a sha', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/contents/proposals/auth-overhaul.comments.json',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Add comments',
          content: Buffer.from('{"version":1,"comments":[]}', 'utf8').toString(
            'base64',
          ),
        }),
      },
    );
    const body = (await response.json()) as WriteResponse;

    expect(response.status).toBe(200);
    expect(body.content.sha).toMatch(/^[a-f0-9]{40}$/);
    await expect(
      readFile(join(basePath, 'auth-overhaul.comments.json'), 'utf8'),
    ).resolves.toContain('"comments":[]');
  });

  it('returns 422 when creating a file that already exists', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/contents/proposals/auth-overhaul.md',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Create proposal',
          content: Buffer.from('# Duplicate\n', 'utf8').toString('base64'),
        }),
      },
    );
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(422);
    expect(body.message).toMatch(/exists/i);
  });

  it('returns commit metadata from file stats', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/proposals/commits?path=proposals/auth-overhaul.md',
    );
    const body = (await response.json()) as CommitResponse[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.commit?.message).toBe('Local file update');
    expect(body[0]?.author?.login).toBe('local-user');
    expect(body[0]?.commit?.author?.date).toMatch(/T/);
  });
});
