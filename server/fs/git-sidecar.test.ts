import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile as writeFileText,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileOperationError } from '../types.js';
import { computeBlobSha } from './operations.js';
import {
  createGitFile,
  deleteGitFile,
  listSidecarEntries,
  readGitFile,
  writeGitFile,
} from './git-sidecar.js';

const execGit = promisify(execFile);

const seededSidecarPath = '.redraft/comments/main/test-doc.comments.json';
const mainNestedSidecarPath = '.redraft/comments/main/docs/arch.comments.json';
const featureSidecarPath =
  '.redraft/comments/feature--docs/test-doc.comments.json';

function commentsJson(resolvedStates: boolean[]): string {
  return JSON.stringify({
    version: 1,
    comments: resolvedStates.map((resolved, index) => ({
      id: `thread-${index + 1}`,
      resolved,
    })),
  });
}

describe('git sidecar operations', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'redraft-git-sidecar-'));

    await mkdir(join(repoRoot, 'docs'), { recursive: true });
    await writeFileText(join(repoRoot, 'test-doc.md'), '# Test doc\n', 'utf8');
    await writeFileText(
      join(repoRoot, 'docs', 'arch.md'),
      '# Architecture\n',
      'utf8',
    );

    await execGit('git', ['init'], { cwd: repoRoot });
    await execGit('git', ['config', 'user.name', 'ReDraft Test'], {
      cwd: repoRoot,
    });
    await execGit('git', ['config', 'user.email', 'redraft@example.com'], {
      cwd: repoRoot,
    });
    await execGit('git', ['add', '.'], { cwd: repoRoot });
    await execGit('git', ['commit', '-m', 'Initial documents'], {
      cwd: repoRoot,
    });
    await execGit('git', ['branch', '-M', 'main'], { cwd: repoRoot });

    await execGit('git', ['checkout', '--orphan', 'redraft'], {
      cwd: repoRoot,
    });
    await execGit('git', ['rm', '-rf', '--ignore-unmatch', '.'], {
      cwd: repoRoot,
    });

    await mkdir(join(repoRoot, '.redraft', 'comments', 'main', 'docs'), {
      recursive: true,
    });
    await mkdir(join(repoRoot, '.redraft', 'comments', 'feature--docs'), {
      recursive: true,
    });
    await writeFileText(
      join(repoRoot, seededSidecarPath),
      commentsJson([false, true]),
      'utf8',
    );
    await writeFileText(
      join(repoRoot, mainNestedSidecarPath),
      commentsJson([false, false]),
      'utf8',
    );
    await writeFileText(
      join(repoRoot, featureSidecarPath),
      commentsJson([false, false, true]),
      'utf8',
    );
    await execGit('git', ['add', '.redraft'], { cwd: repoRoot });
    await execGit('git', ['commit', '-m', 'Seed sidecar branch'], {
      cwd: repoRoot,
    });

    await execGit('git', ['checkout', 'main'], { cwd: repoRoot });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('reads sidecar content from a git branch and returns its blob sha', async () => {
    const content = Buffer.from(commentsJson([false, true]), 'utf8');

    const result = await readGitFile(repoRoot, 'redraft', seededSidecarPath);

    expect(result.content).toEqual(content);
    expect(result.sha).toBe(computeBlobSha(content));
  });

  it('returns 404 when reading from a missing sidecar branch', async () => {
    await expect(
      readGitFile(repoRoot, 'missing-sidecars', seededSidecarPath),
    ).rejects.toMatchObject({
      status: 404,
    } satisfies Partial<FileOperationError>);
  });

  it('returns 404 when reading a missing path from an existing sidecar branch', async () => {
    await expect(
      readGitFile(
        repoRoot,
        'redraft',
        '.redraft/comments/main/missing.comments.json',
      ),
    ).rejects.toMatchObject({
      status: 404,
    } satisfies Partial<FileOperationError>);
  });

  it('writes updated sidecar content when the expected sha matches', async () => {
    const existing = await readGitFile(repoRoot, 'redraft', seededSidecarPath);
    const updatedContent = Buffer.from(
      commentsJson([false, false, true]),
      'utf8',
    );

    const result = await writeGitFile(
      repoRoot,
      'redraft',
      seededSidecarPath,
      updatedContent,
      existing.sha,
      'Update review comments',
    );

    expect(result.sha).toBe(computeBlobSha(updatedContent));
    const { stdout } = await execGit(
      'git',
      ['show', `redraft:${seededSidecarPath}`],
      { cwd: repoRoot },
    );
    expect(stdout).toBe(updatedContent.toString('utf8'));
  });

  it('returns 409 when writing with a stale expected sha', async () => {
    await expect(
      writeGitFile(
        repoRoot,
        'redraft',
        seededSidecarPath,
        Buffer.from(commentsJson([false]), 'utf8'),
        'stale-sha',
        'Update review comments',
      ),
    ).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<FileOperationError>);
  });

  it('returns 404 when writing a path that does not exist on the sidecar branch', async () => {
    await expect(
      writeGitFile(
        repoRoot,
        'redraft',
        '.redraft/comments/main/new.comments.json',
        Buffer.from(commentsJson([false]), 'utf8'),
        'irrelevant-sha',
        'Update review comments',
      ),
    ).rejects.toMatchObject({
      status: 404,
    } satisfies Partial<FileOperationError>);
  });

  it('creates a nested sidecar file and returns the persisted blob sha', async () => {
    const relativePath =
      '.redraft/comments/main/docs/nested/file.comments.json';
    const content = Buffer.from(commentsJson([false]), 'utf8');

    const result = await createGitFile(
      repoRoot,
      'redraft',
      relativePath,
      content,
      'Create nested sidecar',
    );

    expect(result.sha).toBe(computeBlobSha(content));
    const { stdout } = await execGit(
      'git',
      ['show', `redraft:${relativePath}`],
      {
        cwd: repoRoot,
      },
    );
    expect(stdout).toBe(content.toString('utf8'));
  });

  it('deletes a sidecar file when the expected sha matches', async () => {
    const existing = await readGitFile(repoRoot, 'redraft', seededSidecarPath);

    await deleteGitFile(repoRoot, 'redraft', seededSidecarPath, existing.sha);

    await expect(
      readGitFile(repoRoot, 'redraft', seededSidecarPath),
    ).rejects.toMatchObject({
      status: 404,
    } satisfies Partial<FileOperationError>);
  });

  it('returns 409 when deleting with a stale expected sha', async () => {
    await expect(
      deleteGitFile(repoRoot, 'redraft', seededSidecarPath, 'stale-sha'),
    ).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<FileOperationError>);
  });

  it('lists unresolved review entries for the requested document branch namespace', async () => {
    await expect(
      listSidecarEntries(repoRoot, 'redraft', 'main'),
    ).resolves.toEqual([
      { path: 'docs/arch.md', unresolvedCount: 2 },
      { path: 'test-doc.md', unresolvedCount: 1 },
    ]);
  });

  it('returns an empty list when the sidecar branch does not exist', async () => {
    await expect(
      listSidecarEntries(repoRoot, 'missing-sidecars', 'main'),
    ).resolves.toEqual([]);
  });

  it('filters sidecar entries to the requested branch prefix', async () => {
    await expect(
      listSidecarEntries(repoRoot, 'redraft', 'feature/docs'),
    ).resolves.toEqual([{ path: 'test-doc.md', unresolvedCount: 2 }]);
  });

  it('pushes the sidecar branch to the remote after writing', async () => {
    // Set up a bare remote so push has somewhere to go
    const bareRemote = await mkdtemp(join(tmpdir(), 'redraft-bare-'));
    await execGit('git', ['init', '--bare'], { cwd: bareRemote });
    await execGit('git', ['remote', 'add', 'origin', bareRemote], {
      cwd: repoRoot,
    });
    await execGit('git', ['push', 'origin', 'redraft'], { cwd: repoRoot });

    const existing = await readGitFile(repoRoot, 'redraft', seededSidecarPath);
    const updated = Buffer.from(commentsJson([true, true]), 'utf8');
    await writeGitFile(
      repoRoot,
      'redraft',
      seededSidecarPath,
      updated,
      existing.sha,
      'Resolve both threads',
    );

    // Verify the remote received the push
    const { stdout } = await execGit(
      'git',
      ['show', `redraft:${seededSidecarPath}`],
      { cwd: bareRemote },
    );
    expect(stdout).toBe(updated.toString('utf8'));
  });

  it('succeeds silently when no remote is configured', async () => {
    // repoRoot has no remote — writeGitFile should still work
    const existing = await readGitFile(repoRoot, 'redraft', seededSidecarPath);
    const updated = Buffer.from(commentsJson([true]), 'utf8');
    const result = await writeGitFile(
      repoRoot,
      'redraft',
      seededSidecarPath,
      updated,
      existing.sha,
      'Resolve thread',
    );
    expect(result.sha).toBe(computeBlobSha(updated));
  });

  it('resets to remote and saves when sidecar branches diverge', async () => {
    // Set up a bare remote
    const bareRemote = await mkdtemp(join(tmpdir(), 'redraft-bare-'));
    await execGit('git', ['init', '--bare'], { cwd: bareRemote });
    await execGit('git', ['remote', 'add', 'origin', bareRemote], {
      cwd: repoRoot,
    });
    await execGit('git', ['push', 'origin', 'redraft'], { cwd: repoRoot });

    // Clone to a second working copy and push a diverging commit
    const clone = await mkdtemp(join(tmpdir(), 'redraft-clone-'));
    await execGit('git', ['clone', bareRemote, clone]);
    await execGit('git', ['checkout', 'redraft'], { cwd: clone });
    await execGit('git', ['config', 'user.name', 'Other'], { cwd: clone });
    await execGit('git', ['config', 'user.email', 'other@test'], {
      cwd: clone,
    });
    const cloneSidecar = join(clone, seededSidecarPath);
    await mkdir(join(clone, '.redraft', 'comments', 'main'), {
      recursive: true,
    });
    await writeFileText(cloneSidecar, commentsJson([false]), 'utf8');
    await execGit('git', ['add', '.'], { cwd: clone });
    await execGit('git', ['commit', '-m', 'Remote comment'], { cwd: clone });
    await execGit('git', ['push', 'origin', 'redraft'], { cwd: clone });

    // Make a local-only commit — the first sync will detect divergence,
    // reset to remote, and this commit lands on top of remote state.
    await createGitFile(
      repoRoot,
      'redraft',
      seededSidecarPath,
      Buffer.from(commentsJson([true, true]), 'utf8'),
      'Local resolve',
    );
    // That write synced (reset to remote because of divergence) then committed
    // on top. But the push after that commit succeeded, so local and remote
    // are now in sync again. Simulate a SECOND divergence by pushing another
    // commit from the clone.
    await writeFileText(cloneSidecar, commentsJson([true]), 'utf8');
    await execGit('git', ['add', '.'], { cwd: clone });
    await execGit('git', ['commit', '-m', 'Another remote comment'], {
      cwd: clone,
    });
    await execGit('git', ['push', 'origin', 'redraft', '--force'], {
      cwd: clone,
    });

    // Now save again — divergence triggers reset, then save goes through
    const finalContent = Buffer.from(
      commentsJson([false, false, false]),
      'utf8',
    );
    // Use createGitFile since the file state after reset may differ from
    // what we just read (the reset replaces local with remote content).
    const result = await createGitFile(
      repoRoot,
      'redraft',
      seededSidecarPath,
      finalContent,
      'New comment after divergence',
    );

    expect(result.sha).toBe(computeBlobSha(finalContent));

    // Verify the remote has the new content
    const { stdout } = await execGit(
      'git',
      ['show', `redraft:${seededSidecarPath}`],
      { cwd: bareRemote },
    );
    expect(stdout).toBe(finalContent.toString('utf8'));

    await rm(clone, { recursive: true, force: true });
    await rm(bareRemote, { recursive: true, force: true });
  });
});
