import { mkdtemp, rm, writeFile as writeFileToDisk } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileOperationError, type ReviewEntry } from '../types.js';
import { execGitBuffer, execGitText } from './git-exec.js';
import { computeBlobSha } from './operations.js';

const COMMENTS_ROOT = '.redraft/comments';

function sanitizeBranch(branch: string): string {
  return branch.replaceAll('/', '--');
}

async function currentCommit(
  repoRoot: string,
  branch: string,
): Promise<string | null> {
  try {
    return (
      await execGitText(repoRoot, ['rev-parse', '--verify', branch])
    ).trim();
  } catch {
    return null;
  }
}

async function currentBlobSha(
  repoRoot: string,
  branch: string,
  path: string,
): Promise<string> {
  try {
    return (
      await execGitText(repoRoot, ['rev-parse', `${branch}:${path}`])
    ).trim();
  } catch {
    throw new FileOperationError(404, `Git path not found: ${branch}:${path}`);
  }
}

function assertExpectedSha(actualSha: string, expectedSha: string): void {
  if (actualSha !== expectedSha) {
    throw new FileOperationError(
      409,
      'File was modified since you loaded it. Please refresh and re-apply your changes.',
    );
  }
}

async function hashContent(
  repoRoot: string,
  tempDir: string,
  content: Buffer,
): Promise<string> {
  const tempFile = join(tempDir, 'content');
  await writeFileToDisk(tempFile, content);
  return (await execGitText(repoRoot, ['hash-object', '-w', tempFile])).trim();
}

async function commitIndex(
  repoRoot: string,
  branch: string,
  message: string,
  env: NodeJS.ProcessEnv,
  parent: string | null,
): Promise<void> {
  const tree = (await execGitText(repoRoot, ['write-tree'], { env })).trim();
  if (parent) {
    const parentTree = (
      await execGitText(repoRoot, ['rev-parse', `${parent}^{tree}`])
    ).trim();
    if (tree === parentTree) {
      return;
    }
  }

  const commitArgs = ['commit-tree', tree, '-m', message];
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
  const commit = (
    await execGitText(repoRoot, commitArgs, { env: commitEnv })
  ).trim();
  await execGitText(repoRoot, ['update-ref', `refs/heads/${branch}`, commit]);
}

async function syncWithRemote(repoRoot: string, branch: string): Promise<void> {
  try {
    await execGitText(repoRoot, ['fetch', 'origin', branch]);
  } catch {
    return; // No remote, offline, or branch not on remote — commit locally.
  }

  const local = await currentCommit(repoRoot, branch);
  const remote = (
    await execGitText(repoRoot, ['rev-parse', `origin/${branch}`])
  ).trim();

  if (!local || local === remote) return;

  try {
    await execGitText(repoRoot, [
      'merge-base',
      '--is-ancestor',
      branch,
      `origin/${branch}`,
    ]);
    // Local is behind remote — fast-forward.
    await execGitText(repoRoot, ['update-ref', `refs/heads/${branch}`, remote]);
    return;
  } catch {
    // Not a fast-forward — check the reverse.
  }

  try {
    await execGitText(repoRoot, [
      'merge-base',
      '--is-ancestor',
      `origin/${branch}`,
      branch,
    ]);
    // Remote is behind local — push after commit will catch up.
    return;
  } catch {
    // Neither is ancestor — branches diverged.
    // Reset local to remote, preserving the old tip in the reflog.
    console.warn(
      `[ReDraft] Sidecar branch "${branch}" diverged from remote. ` +
        `Resetting to origin/${branch}. ` +
        `Previous local tip ${local} is recoverable via: git reflog show ${branch}`,
    );
    await execGitText(repoRoot, [
      'update-ref',
      `refs/heads/${branch}`,
      remote,
      local, // old-value — ensures reflog entry is created
    ]);
  }
}

async function tryPush(repoRoot: string, branch: string): Promise<void> {
  try {
    await execGitText(repoRoot, ['push', 'origin', branch]);
  } catch {
    // Best-effort: no remote, no network — local commit is safe.
  }
}

async function withTemporaryIndex<T>(
  repoRoot: string,
  branch: string,
  callback: (
    env: NodeJS.ProcessEnv,
    parent: string | null,
    tempDir: string,
  ) => Promise<T>,
): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), 'redraft-git-sidecar-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(tempDir, 'index') };
  const parent = await currentCommit(repoRoot, branch);

  try {
    if (parent) {
      await execGitText(repoRoot, ['read-tree', branch], { env });
    }
    return await callback(env, parent, tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function documentPathFromSidecarPath(
  sidecarPath: string,
  docBranch: string,
): string {
  const prefix = `${COMMENTS_ROOT}/${sanitizeBranch(docBranch)}/`;
  return sidecarPath.slice(prefix.length).replace(/\.comments\.json$/u, '.md');
}

export async function readGitFile(
  repoRoot: string,
  branch: string,
  path: string,
): Promise<{ content: Buffer; sha: string }> {
  try {
    const content = await execGitBuffer(repoRoot, [
      'show',
      `${branch}:${path}`,
    ]);
    return { content, sha: computeBlobSha(content) };
  } catch {
    throw new FileOperationError(404, `Git path not found: ${branch}:${path}`);
  }
}

export async function writeGitFile(
  repoRoot: string,
  branch: string,
  path: string,
  content: Buffer,
  expectedSha: string,
  message: string,
): Promise<{ sha: string }> {
  await syncWithRemote(repoRoot, branch);
  const actualSha = await currentBlobSha(repoRoot, branch, path);
  assertExpectedSha(actualSha, expectedSha);

  const result = await withTemporaryIndex(
    repoRoot,
    branch,
    async (env, parent, tempDir) => {
      const blobSha = await hashContent(repoRoot, tempDir, content);
      await execGitText(
        repoRoot,
        ['update-index', '--add', '--cacheinfo', `100644,${blobSha},${path}`],
        { env },
      );
      await commitIndex(repoRoot, branch, message, env, parent);
      return { sha: blobSha };
    },
  );
  await tryPush(repoRoot, branch);
  return result;
}

export async function createGitFile(
  repoRoot: string,
  branch: string,
  path: string,
  content: Buffer,
  message: string,
): Promise<{ sha: string }> {
  await syncWithRemote(repoRoot, branch);
  const result = await withTemporaryIndex(
    repoRoot,
    branch,
    async (env, parent, tempDir) => {
      const blobSha = await hashContent(repoRoot, tempDir, content);
      await execGitText(
        repoRoot,
        ['update-index', '--add', '--cacheinfo', `100644,${blobSha},${path}`],
        { env },
      );
      await commitIndex(repoRoot, branch, message, env, parent);
      return { sha: blobSha };
    },
  );
  await tryPush(repoRoot, branch);
  return result;
}

export async function deleteGitFile(
  repoRoot: string,
  branch: string,
  path: string,
  expectedSha: string,
): Promise<void> {
  await syncWithRemote(repoRoot, branch);
  const actualSha = await currentBlobSha(repoRoot, branch, path);
  assertExpectedSha(actualSha, expectedSha);

  await withTemporaryIndex(repoRoot, branch, async (env, parent) => {
    await execGitText(repoRoot, ['update-index', '--force-remove', path], {
      env,
    });
    await commitIndex(repoRoot, branch, `Delete ${path}`, env, parent);
  });
  await tryPush(repoRoot, branch);
}

export async function listSidecarEntries(
  repoRoot: string,
  sidecarBranch: string,
  docBranch: string,
): Promise<ReviewEntry[]> {
  let stdout: string;
  try {
    stdout = await execGitText(repoRoot, [
      'ls-tree',
      '-r',
      '--name-only',
      sidecarBranch,
    ]);
  } catch {
    return [];
  }

  const prefix = `${COMMENTS_ROOT}/${sanitizeBranch(docBranch)}/`;
  const commentPaths = stdout
    .split('\n')
    .filter(
      (path) => path.startsWith(prefix) && path.endsWith('.comments.json'),
    );

  const entries = await Promise.all(
    commentPaths.map(async (path) => {
      const content = await execGitBuffer(repoRoot, [
        'show',
        `${sidecarBranch}:${path}`,
      ]);
      const parsed = JSON.parse(content.toString('utf8')) as {
        comments?: Array<{ resolved?: boolean }>;
      };

      return {
        path: documentPathFromSidecarPath(path, docBranch),
        unresolvedCount:
          parsed.comments?.filter((comment) => comment.resolved !== true)
            .length ?? 0,
      } satisfies ReviewEntry;
    }),
  );

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}
