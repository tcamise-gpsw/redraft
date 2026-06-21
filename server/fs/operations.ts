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

import { FileOperationError, type TreeEntry } from '../types.js';

function resolvePath(basePath: string, relativePath: string): string {
  const resolvedBase = resolve(basePath);
  const resolvedPath = resolve(resolvedBase, relativePath);
  const relativePathToBase = relative(resolvedBase, resolvedPath);

  if (relativePathToBase.startsWith('..')) {
    throw new FileOperationError(400, 'Path escapes the proposals root.');
  }

  return resolvedPath;
}

function isTrackedProposalFile(path: string): boolean {
  return path.endsWith('.md') || path.endsWith('.comments.json');
}

async function walkFiles(
  basePath: string,
  currentPath = '',
): Promise<TreeEntry[]> {
  const directoryPath = resolvePath(basePath, currentPath || '.');
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: TreeEntry[] = [];

  for (const entry of entries) {
    const nextRelativePath = currentPath
      ? `${currentPath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(basePath, nextRelativePath)));
      continue;
    }

    if (!entry.isFile() || !isTrackedProposalFile(nextRelativePath)) {
      continue;
    }

    files.push({ path: nextRelativePath, type: 'blob' });
  }

  return files;
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

export async function listFiles(basePath: string): Promise<TreeEntry[]> {
  const files = await walkFiles(basePath);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}
