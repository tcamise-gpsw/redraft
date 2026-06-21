import {
  mkdtemp,
  mkdir,
  readFile as readFileText,
  rm,
  writeFile as writeFileText,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  computeBlobSha,
  createFile,
  deleteFile,
  listFiles,
  readFile,
  writeFile,
} from './operations.js';
import { FileOperationError } from '../types.js';

describe('filesystem operations', () => {
  let basePath: string;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'redraft-fs-'));
    await mkdir(join(basePath, 'nested'), { recursive: true });
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('computes GitHub-compatible blob SHA values', () => {
    expect(computeBlobSha(Buffer.from('hello\n', 'utf8'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });

  it('reads a file and returns raw content and sha', async () => {
    await writeFileText(join(basePath, 'doc.md'), '# Hello\n', 'utf8');

    const result = await readFile(basePath, 'doc.md');

    expect(result.content.toString('utf8')).toBe('# Hello\n');
    expect(result.sha).toBe(computeBlobSha(Buffer.from('# Hello\n', 'utf8')));
  });

  it('rejects path traversal attempts', async () => {
    await expect(readFile(basePath, '../etc/passwd')).rejects.toMatchObject({
      status: 400,
    } satisfies Partial<FileOperationError>);
  });

  it('rejects stale sha writes with a 409 conflict error', async () => {
    await writeFileText(join(basePath, 'doc.md'), 'old', 'utf8');

    await expect(
      writeFile(basePath, 'doc.md', Buffer.from('new', 'utf8'), 'stale-sha'),
    ).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<FileOperationError>);
  });

  it('rejects creating a file that already exists', async () => {
    await writeFileText(join(basePath, 'doc.md'), 'old', 'utf8');

    await expect(
      createFile(basePath, 'doc.md', Buffer.from('new', 'utf8')),
    ).rejects.toMatchObject({
      status: 422,
    } satisfies Partial<FileOperationError>);
  });

  it('lists only markdown and comment sidecar files', async () => {
    await writeFileText(join(basePath, 'proposal.md'), '# Proposal\n', 'utf8');
    await writeFileText(
      join(basePath, 'proposal.comments.json'),
      '{"version":1,"comments":[]}',
      'utf8',
    );
    await writeFileText(join(basePath, 'notes.txt'), 'ignore me', 'utf8');
    await writeFileText(
      join(basePath, 'nested', 'diagram.md'),
      '# Nested\n',
      'utf8',
    );

    const files = await listFiles(basePath);

    expect(files).toEqual([
      { path: 'nested/diagram.md', type: 'blob' },
      { path: 'proposal.comments.json', type: 'blob' },
      { path: 'proposal.md', type: 'blob' },
    ]);
  });

  it('creates a new file and returns its computed sha', async () => {
    const result = await createFile(
      basePath,
      'new.md',
      Buffer.from('# New\n', 'utf8'),
    );

    expect(result.sha).toBe(computeBlobSha(Buffer.from('# New\n', 'utf8')));
    await expect(readFileText(join(basePath, 'new.md'), 'utf8')).resolves.toBe(
      '# New\n',
    );
  });

  it('deletes a file when the expected sha matches', async () => {
    await writeFileText(
      join(basePath, 'delete-me.md'),
      '# Delete me\n',
      'utf8',
    );
    const existing = await readFile(basePath, 'delete-me.md');

    await deleteFile(basePath, 'delete-me.md', existing.sha);

    await expect(
      readFileText(join(basePath, 'delete-me.md'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects deleting a file when the expected sha is stale', async () => {
    await writeFileText(
      join(basePath, 'delete-me.md'),
      '# Delete me\n',
      'utf8',
    );

    await expect(
      deleteFile(basePath, 'delete-me.md', 'stale-sha'),
    ).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<FileOperationError>);
  });
});
