import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildGitHubApiRouter } from './index.js';

const execGit = promisify(execFile);

interface GitStatusResponse {
  dirty: boolean;
  files: Array<{ path: string; status: 'modified' | 'untracked' | 'deleted' }>;
}

interface GitCommitResponse {
  sha: string;
  message: string;
}

describe('Git convenience routes', () => {
  let repoRoot: string;
  let basePath: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'redraft-git-'));
    basePath = join(repoRoot, 'docs');
    await mkdir(basePath, { recursive: true });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');

    await execGit('git', ['init'], { cwd: repoRoot });
    await execGit('git', ['config', 'user.name', 'ReDraft Test'], {
      cwd: repoRoot,
    });
    await execGit('git', ['config', 'user.email', 'redraft@example.com'], {
      cwd: repoRoot,
    });
    await execGit('git', ['add', 'docs'], { cwd: repoRoot });
    await execGit('git', ['commit', '-m', 'Initial documents'], {
      cwd: repoRoot,
    });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('reports the active git branch', async () => {
    await execGit('git', ['checkout', '-b', 'feature/local-docs'], {
      cwd: repoRoot,
    });
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/branch');
    const body = (await response.json()) as { branch: string };

    expect(response.status).toBe(200);
    expect(body.branch).toBe('feature/local-docs');
  });

  it('returns 404 for branch endpoint outside a git repository', async () => {
    const looseRoot = await mkdtemp(join(tmpdir(), 'redraft-no-git-'));
    const looseDocs = join(looseRoot, 'docs');
    await mkdir(looseDocs, { recursive: true });

    try {
      const app = buildGitHubApiRouter(looseDocs);
      const response = await app.request('http://local.test/api/git/branch');
      const body = (await response.json()) as { message: string };

      expect(response.status).toBe(404);
      expect(body.message).toMatch(/git repository/i);
    } finally {
      await rm(looseRoot, { recursive: true, force: true });
    }
  });

  it('reports modified document files in git status', async () => {
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Updated\n', 'utf8');
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/status');
    const body = (await response.json()) as GitStatusResponse;

    expect(response.status).toBe(200);
    expect(body.dirty).toBe(true);
    expect(body.files).toContainEqual({
      path: 'docs/auth-overhaul.md',
      status: 'modified',
    });
  });

  it('creates a commit for pending document changes', async () => {
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Updated\n', 'utf8');
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Update documents via ReDraft' }),
    });
    const body = (await response.json()) as GitCommitResponse;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Update documents via ReDraft');
    expect(body.sha).toMatch(/^[a-f0-9]{40}$/);

    const { stdout } = await execGit('git', ['log', '-1', '--pretty=%s'], {
      cwd: repoRoot,
    });
    expect(stdout.trim()).toBe('Update documents via ReDraft');
  });

  it('returns 404 when the served directory is not inside a git repository', async () => {
    const looseRoot = await mkdtemp(join(tmpdir(), 'redraft-no-git-'));
    const looseDocs = join(looseRoot, 'docs');
    await mkdir(looseDocs, { recursive: true });
    await writeFile(join(looseDocs, 'doc.md'), '# Doc\n', 'utf8');

    try {
      const app = buildGitHubApiRouter(looseDocs);
      const response = await app.request('http://local.test/api/git/status');
      const body = (await response.json()) as { message: string };

      expect(response.status).toBe(404);
      expect(body.message).toMatch(/git repository/i);
    } finally {
      await rm(looseRoot, { recursive: true, force: true });
    }
  });

  it('returns an auto-generated commit message when none is provided', async () => {
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Updated\n', 'utf8');
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await response.json()) as GitCommitResponse;

    expect(response.status).toBe(200);
    expect(body.message).toMatch(/Update documents via ReDraft/);

    const { stdout } = await execGit('git', ['log', '-1', '--pretty=%s'], {
      cwd: repoRoot,
    });
    expect(stdout.trim()).toBe(body.message);
  });

  it('scopes status to proposal files only', async () => {
    await writeFile(join(repoRoot, 'README.md'), '# Root\n', 'utf8');
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/status');
    const body = (await response.json()) as GitStatusResponse;

    expect(response.status).toBe(200);
    expect(body.files).toEqual([]);
    expect(body.dirty).toBe(false);
  });
});
