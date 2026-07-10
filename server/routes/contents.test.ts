import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGitHubApiRouter } from './index.js';

const execGit = promisify(execFile);

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

const sidecarPath = '.redraft/comments/main/auth-overhaul.comments.json';

async function initializeSidecarBranch(basePath: string): Promise<void> {
  await execGit('git', ['init'], { cwd: basePath });
  await execGit('git', ['config', 'user.name', 'ReDraft Test'], {
    cwd: basePath,
  });
  await execGit('git', ['config', 'user.email', 'redraft@example.com'], {
    cwd: basePath,
  });
  await execGit('git', ['add', '.'], { cwd: basePath });
  await execGit('git', ['commit', '-m', 'Initial documents'], {
    cwd: basePath,
  });
  await execGit('git', ['branch', '-M', 'main'], { cwd: basePath });
  await execGit('git', ['checkout', '--orphan', 'redraft'], {
    cwd: basePath,
  });
  await execGit('git', ['rm', '-rf', '--ignore-unmatch', '.'], {
    cwd: basePath,
  });
  await mkdir(join(basePath, '.redraft', 'comments', 'main'), {
    recursive: true,
  });
  await writeFile(
    join(basePath, sidecarPath),
    '{"version":1,"comments":[{"id":"thread-1","resolved":false}]}',
    'utf8',
  );
  await execGit('git', ['add', '.redraft'], { cwd: basePath });
  await execGit('git', ['commit', '-m', 'Seed sidecar branch'], {
    cwd: basePath,
  });
  await execGit('git', ['checkout', 'main'], { cwd: basePath });
}

describe('GitHub contents-style routes', () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'redraft-routes-'));
    await mkdir(join(basePath, 'nested'), { recursive: true });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('returns the local user identity', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/github/user');
    const body = (await response.json()) as UserResponse;

    expect(response.status).toBe(200);
    expect(body).toEqual({ login: 'local-user', avatar_url: '' });
    expect(response.headers.get('x-ratelimit-remaining')).toBe('999999');
  });

  it('returns base64-encoded file content and sha for root-relative files', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md',
    );
    const body = (await response.json()) as FileResponse;

    expect(response.status).toBe(200);
    expect(body.type).toBe('file');
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(
      '# Auth\n',
    );
    expect(body.sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('ignores ref for document reads and still uses the filesystem', async () => {
    await initializeSidecarBranch(basePath);
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md?ref=main',
    );
    const body = (await response.json()) as FileResponse;

    expect(response.status).toBe(200);
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(
      '# Auth\n',
    );
  });

  it('updates root-relative content when the incoming sha matches', async () => {
    const app = buildGitHubApiRouter(basePath);
    const existing = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md',
    );
    const existingBody = (await existing.json()) as FileResponse;

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Update document',
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

  it('ignores branch for document writes and still updates the filesystem', async () => {
    await initializeSidecarBranch(basePath);
    const app = buildGitHubApiRouter(basePath);
    const existing = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md?ref=main',
    );
    const existingBody = (await existing.json()) as FileResponse;

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branch: 'main',
          message: 'Update document',
          sha: existingBody.sha,
          content: Buffer.from('# Updated via filesystem\n', 'utf8').toString(
            'base64',
          ),
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(
      readFile(join(basePath, 'auth-overhaul.md'), 'utf8'),
    ).resolves.toBe('# Updated via filesystem\n');
  });

  it('returns 409 when a PUT request uses a stale sha', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Update document',
          sha: 'stale-sha',
          content: Buffer.from('# Updated\n', 'utf8').toString('base64'),
        }),
      },
    );
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(409);
    expect(body.message).toMatch(/conflict/i);
  });

  it('creates a missing comment file under .redraft/comments when PUT is sent without a sha', async () => {
    const app = buildGitHubApiRouter(basePath);
    await mkdir(join(basePath, '.redraft', 'comments'), { recursive: true });

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/.redraft/comments/auth-overhaul.comments.json',
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
      readFile(
        join(basePath, '.redraft', 'comments', 'auth-overhaul.comments.json'),
        'utf8',
      ),
    ).resolves.toContain('"comments":[]');
  });

  it('returns 422 when creating a file that already exists', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/contents/auth-overhaul.md',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'Create document',
          content: Buffer.from('# Duplicate\n', 'utf8').toString('base64'),
        }),
      },
    );
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(422);
    expect(body.message).toMatch(/exists/i);
  });

  it('reads sidecar content from the git branch when ref is provided', async () => {
    await initializeSidecarBranch(basePath);
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      `http://local.test/api/github/repos/local/redraft/contents/${sidecarPath}?ref=redraft`,
    );
    const body = (await response.json()) as FileResponse;

    expect(response.status).toBe(200);
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toContain(
      'thread-1',
    );
    expect(body.sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('writes sidecar content to the git branch when branch is provided', async () => {
    await initializeSidecarBranch(basePath);
    const app = buildGitHubApiRouter(basePath);
    const existing = await app.request(
      `http://local.test/api/github/repos/local/redraft/contents/${sidecarPath}?ref=redraft`,
    );
    const existingBody = (await existing.json()) as FileResponse;
    const nextContent =
      '{"version":1,"comments":[{"id":"thread-2","resolved":false}]}';

    const response = await app.request(
      `http://local.test/api/github/repos/local/redraft/contents/${sidecarPath}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branch: 'redraft',
          message: 'Update comments',
          sha: existingBody.sha,
          content: Buffer.from(nextContent, 'utf8').toString('base64'),
        }),
      },
    );
    const body = (await response.json()) as WriteResponse;

    expect(response.status).toBe(200);
    expect(body.content.sha).toMatch(/^[a-f0-9]{40}$/);
    const { stdout } = await execGit(
      'git',
      ['show', `redraft:${sidecarPath}`],
      {
        cwd: basePath,
      },
    );
    expect(stdout).toBe(nextContent);
  });

  it('creates sidecar content on the git branch when PUT has branch but no sha', async () => {
    await initializeSidecarBranch(basePath);
    const app = buildGitHubApiRouter(basePath);
    const newSidecarPath = '.redraft/comments/main/nested/new.comments.json';
    const content = '{"version":1,"comments":[]}';

    const response = await app.request(
      `http://local.test/api/github/repos/local/redraft/contents/${newSidecarPath}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branch: 'redraft',
          message: 'Add comments',
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      },
    );

    expect(response.status).toBe(200);
    const { stdout } = await execGit(
      'git',
      ['show', `redraft:${newSidecarPath}`],
      { cwd: basePath },
    );
    expect(stdout).toBe(content);
  });

  it('deletes sidecar content from the git branch when branch is provided', async () => {
    await initializeSidecarBranch(basePath);
    const app = buildGitHubApiRouter(basePath);
    const existing = await app.request(
      `http://local.test/api/github/repos/local/redraft/contents/${sidecarPath}?ref=redraft`,
    );
    const existingBody = (await existing.json()) as FileResponse;

    const response = await app.request(
      `http://local.test/api/github/repos/local/redraft/contents/${sidecarPath}`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branch: 'redraft', sha: existingBody.sha }),
      },
    );

    expect(response.status).toBe(200);
    await expect(
      execGit('git', ['show', `redraft:${sidecarPath}`], { cwd: basePath }),
    ).rejects.toThrow();
  });

  it('returns commit metadata from file stats for root-relative paths', async () => {
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request(
      'http://local.test/api/github/repos/local/redraft/commits?path=auth-overhaul.md',
    );
    const body = (await response.json()) as CommitResponse[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.commit?.message).toBe('Local file update');
    expect(body[0]?.author?.login).toBe('local-user');
    expect(body[0]?.commit?.author?.date).toMatch(/T/);
  });
});
