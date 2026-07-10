import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execGitBuffer, execGitText } from './git-exec.js';

describe('git exec helpers', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'redraft-git-exec-'));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('runs git commands with text stdout', async () => {
    await execGitText(repoRoot, ['init']);

    const root = await execGitText(repoRoot, ['rev-parse', '--show-toplevel']);

    expect(await realpath(root.trim())).toBe(await realpath(repoRoot));
  });

  it('runs git commands with buffer stdout', async () => {
    await execGitText(repoRoot, ['init']);
    await execGitText(repoRoot, ['config', 'user.name', 'ReDraft Test']);
    await execGitText(repoRoot, [
      'config',
      'user.email',
      'redraft@example.com',
    ]);
    await writeFile(join(repoRoot, 'README.md'), '# Hi\n', 'utf8');
    await execGitText(repoRoot, ['add', 'README.md']);
    await execGitText(repoRoot, ['commit', '-m', 'Initial']);

    const content = await execGitBuffer(repoRoot, ['show', 'HEAD:README.md']);

    expect(content).toEqual(Buffer.from('# Hi\n', 'utf8'));
  });

  it('rejects with stderr when git exits non-zero', async () => {
    await expect(
      execGitText(repoRoot, ['rev-parse', '--show-toplevel']),
    ).rejects.toMatchObject({
      code: 128,
    });
  });
});
