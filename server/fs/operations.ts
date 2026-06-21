import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile as readFileFromDisk,
  readdir,
  stat,
  unlink,
  writeFile as writeFileToDisk,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import ignore, { type Ignore } from 'ignore';

import {
  FileOperationError,
  type ReviewEntry,
  type TreeEntry,
} from '../types.js';

const COMMENTS_ROOT = '.redraft/comments';
const BUILT_IN_EXCLUDES = ['.git/', '.redraft/', 'node_modules/'];

function resolvePath(basePath: string, relativePath: string): string {
  const resolvedBase = resolve(basePath);
  const resolvedPath = resolve(resolvedBase, relativePath);
  const relativePathToBase = relative(resolvedBase, resolvedPath);

  if (relativePathToBase.startsWith('..')) {
    throw new FileOperationError(400, 'Path escapes the workspace root.');
  }

  return resolvedPath;
}

function isMarkdownFile(path: string): boolean {
  return path.endsWith('.md');
}

function isCommentFile(path: string): boolean {
  return path.endsWith('.comments.json');
}

function scopeGitignorePattern(currentPath: string, pattern: string): string {
  if (!currentPath || !pattern || pattern.startsWith('#')) {
    return pattern;
  }

  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  if (!body) {
    return pattern;
  }

  const normalized = body.startsWith('/') ? body.slice(1) : body;
  const scoped = `${currentPath}/${normalized}`;
  return `${negated ? '!' : ''}${scoped}`;
}

async function addGitignoreRules(
  basePath: string,
  currentPath: string,
  matcher: Ignore,
): Promise<void> {
  const gitignorePath = resolvePath(
    basePath,
    currentPath ? `${currentPath}/.gitignore` : '.gitignore',
  );

  try {
    const content = await readFileFromDisk(gitignorePath, 'utf8');
    matcher.add(
      content
        .split(/\r?\n/u)
        .map((pattern) => scopeGitignorePattern(currentPath, pattern)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function walkMarkdownFilesInternal(
  basePath: string,
  matcher: Ignore,
  currentPath = '',
): Promise<TreeEntry[]> {
  const directoryPath = resolvePath(basePath, currentPath || '.');
  await addGitignoreRules(basePath, currentPath, matcher);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: TreeEntry[] = [];

  for (const entry of entries) {
    if (entry.name === '.gitignore') {
      continue;
    }

    const nextRelativePath = currentPath
      ? `${currentPath}/${entry.name}`
      : entry.name;

    if (
      matcher.ignores(nextRelativePath) ||
      (entry.isDirectory() && matcher.ignores(`${nextRelativePath}/`))
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(
        ...(await walkMarkdownFilesInternal(
          basePath,
          matcher,
          nextRelativePath,
        )),
      );
      continue;
    }

    if (!entry.isFile() || !isMarkdownFile(nextRelativePath)) {
      continue;
    }

    files.push({ path: nextRelativePath, type: 'blob' });
  }

  return files;
}

async function walkCommentFiles(
  basePath: string,
  currentPath = COMMENTS_ROOT,
): Promise<string[]> {
  const directoryPath = resolvePath(basePath, currentPath);

  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    const nextRelativePath = `${currentPath}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await walkCommentFiles(basePath, nextRelativePath)));
      continue;
    }

    if (!entry.isFile() || !isCommentFile(nextRelativePath)) {
      continue;
    }

    files.push(nextRelativePath);
  }

  return files;
}

function documentPathFromCommentPath(commentPath: string): string {
  return commentPath
    .slice(`${COMMENTS_ROOT}/`.length)
    .replace(/\.comments\.json$/u, '.md');
}

export function computeBlobSha(content: Buffer): string {
  return createHash('sha1')
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest('hex');
}

export async function readFile(
  basePath: string,
  relativePath: string,
): Promise<{ content: Buffer; sha: string }> {
  const filePath = resolvePath(basePath, relativePath);

  let content: Buffer;
  try {
    content = await readFileFromDisk(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FileOperationError(404, `File not found: ${relativePath}`);
    }

    throw error;
  }

  return { content, sha: computeBlobSha(content) };
}

export async function writeFile(
  basePath: string,
  relativePath: string,
  content: Buffer,
  expectedSha: string | null,
): Promise<{ sha: string }> {
  const filePath = resolvePath(basePath, relativePath);
  const current = await readFile(basePath, relativePath);

  if (expectedSha && expectedSha !== current.sha) {
    throw new FileOperationError(409, 'File SHA conflict.');
  }

  await writeFileToDisk(filePath, content);
  return { sha: computeBlobSha(content) };
}

export async function createFile(
  basePath: string,
  relativePath: string,
  content: Buffer,
): Promise<{ sha: string }> {
  const filePath = resolvePath(basePath, relativePath);

  try {
    await stat(filePath);
    throw new FileOperationError(422, `File already exists: ${relativePath}`);
  } catch (error) {
    if (error instanceof FileOperationError) {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFileToDisk(filePath, content);
  return { sha: computeBlobSha(content) };
}

export async function deleteFile(
  basePath: string,
  relativePath: string,
  expectedSha: string,
): Promise<void> {
  const current = await readFile(basePath, relativePath);

  if (expectedSha !== current.sha) {
    throw new FileOperationError(409, 'File SHA conflict.');
  }

  const filePath = resolvePath(basePath, relativePath);
  await unlink(filePath);
}

export async function walkMarkdownFiles(
  basePath: string,
): Promise<TreeEntry[]> {
  const matcher = ignore();
  matcher.add(BUILT_IN_EXCLUDES);
  const files = await walkMarkdownFilesInternal(basePath, matcher);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function listReviewEntries(
  basePath: string,
): Promise<ReviewEntry[]> {
  const commentFiles = await walkCommentFiles(basePath);
  const entries = await Promise.all(
    commentFiles.map(async (commentPath) => {
      const { content } = await readFile(basePath, commentPath);
      const parsed = JSON.parse(content.toString('utf8')) as {
        comments?: Array<{ resolved?: boolean }>;
      };

      return {
        path: documentPathFromCommentPath(commentPath),
        unresolvedCount:
          parsed.comments?.filter((comment) => comment.resolved !== true)
            .length ?? 0,
      };
    }),
  );

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export async function listFiles(basePath: string): Promise<TreeEntry[]> {
  return walkMarkdownFiles(basePath);
}
