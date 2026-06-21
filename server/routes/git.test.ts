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
    repoRoot = await mkdtemp(join(tmpdir(), 'draftspace-git-'));
    basePath = join(repoRoot, 'proposals');
    await mkdir(basePath, { recursive: true });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');

    await execGit('git', ['init'], { cwd: repoRoot });
    await execGit('git', ['config', 'user.name', 'Draftspace Test'], {
      cwd: repoRoot,
    });
    await execGit('git', ['config', 'user.email', 'draftspace@example.com'], {
      cwd: repoRoot,
    });
    await execGit('git', ['add', 'proposals'], { cwd: repoRoot });
    await execGit('git', ['commit', '-m', 'Initial proposals'], {
      cwd: repoRoot,
    });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('reports modified proposal files in git status', async () => {
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Updated\n', 'utf8');
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/status');
    const body = (await response.json()) as GitStatusResponse;

    expect(response.status).toBe(200);
    expect(body.dirty).toBe(true);
    expect(body.files).toContainEqual({
      path: 'proposals/auth-overhaul.md',
      status: 'modified',
    });
  });

  it('creates a commit for pending proposal changes', async () => {
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Updated\n', 'utf8');
    const app = buildGitHubApiRouter(basePath);

    const response = await app.request('http://local.test/api/git/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Update proposals via Draftspace' }),
    });
    const body = (await response.json()) as GitCommitResponse;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Update proposals via Draftspace');
    expect(body.sha).toMatch(/^[a-f0-9]{40}$/);

    const { stdout } = await execGit('git', ['log', '-1', '--pretty=%s'], {
      cwd: repoRoot,
    });
    expect(stdout.trim()).toBe('Update proposals via Draftspace');
  });

  it('returns 404 when the proposals directory is not inside a git repository', async () => {
    const looseRoot = await mkdtemp(join(tmpdir(), 'draftspace-no-git-'));
    const looseProposals = join(looseRoot, 'proposals');
    await mkdir(looseProposals, { recursive: true });
    await writeFile(join(looseProposals, 'doc.md'), '# Doc\n', 'utf8');

    try {
      const app = buildGitHubApiRouter(looseProposals);
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
    expect(body.message).toMatch(/Update proposals via Draftspace/);

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
