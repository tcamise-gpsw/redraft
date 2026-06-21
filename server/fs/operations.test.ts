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
  listReviewEntries,
  readFile,
  walkMarkdownFiles,
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

  it('walks only markdown files', async () => {
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

    const files = await walkMarkdownFiles(basePath);

    expect(files).toEqual([
      { path: 'nested/diagram.md', type: 'blob' },
      { path: 'proposal.md', type: 'blob' },
    ]);
  });

  it('respects root and nested gitignore files while walking markdown files', async () => {
    await mkdir(join(basePath, 'docs', 'drafts'), { recursive: true });
    await mkdir(join(basePath, 'ignored'), { recursive: true });
    await writeFileText(join(basePath, '.gitignore'), 'ignored/\n', 'utf8');
    await writeFileText(join(basePath, 'docs', '.gitignore'), 'drafts/\n', 'utf8');
    await writeFileText(join(basePath, 'README.md'), '# Root\n', 'utf8');
    await writeFileText(join(basePath, 'ignored', 'hidden.md'), '# Hidden\n', 'utf8');
    await writeFileText(join(basePath, 'docs', 'visible.md'), '# Visible\n', 'utf8');
    await writeFileText(join(basePath, 'docs', 'drafts', 'secret.md'), '# Secret\n', 'utf8');

    const files = await walkMarkdownFiles(basePath);

    expect(files).toEqual([
      { path: 'docs/visible.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ]);
  });

  it('ignores built-in metadata directories even without gitignore rules', async () => {
    await mkdir(join(basePath, '.git', 'docs'), { recursive: true });
    await mkdir(join(basePath, '.redraft', 'comments'), { recursive: true });
    await mkdir(join(basePath, 'node_modules', 'pkg'), { recursive: true });
    await writeFileText(join(basePath, '.git', 'docs', 'ignored.md'), '# Git\n', 'utf8');
    await writeFileText(
      join(basePath, '.redraft', 'comments', 'doc.comments.json'),
      '{"version":1,"comments":[]}',
      'utf8',
    );
    await writeFileText(
      join(basePath, 'node_modules', 'pkg', 'README.md'),
      '# Package\n',
      'utf8',
    );
    await writeFileText(join(basePath, 'visible.md'), '# Visible\n', 'utf8');

    const files = await walkMarkdownFiles(basePath);

    expect(files).toEqual([{ path: 'visible.md', type: 'blob' }]);
  });

  it('lists review entries with unresolved thread counts', async () => {
    await mkdir(join(basePath, '.redraft', 'comments', 'docs'), { recursive: true });
    await writeFileText(
      join(basePath, '.redraft', 'comments', 'README.comments.json'),
      JSON.stringify({
        version: 1,
        comments: [
          { id: 'a', quote: 'one', quoteContext: { prefix: '', suffix: '' }, author: { login: 'u', avatarUrl: '' }, body: 'body', createdAt: '2026-01-01T00:00:00.000Z', resolved: false, replies: [] },
          { id: 'b', quote: 'two', quoteContext: { prefix: '', suffix: '' }, author: { login: 'u', avatarUrl: '' }, body: 'body', createdAt: '2026-01-01T00:00:00.000Z', resolved: true, replies: [] },
        ],
      }),
      'utf8',
    );
    await writeFileText(
      join(basePath, '.redraft', 'comments', 'docs', 'arch.comments.json'),
      JSON.stringify({
        version: 1,
        comments: [
          { id: 'c', quote: 'three', quoteContext: { prefix: '', suffix: '' }, author: { login: 'u', avatarUrl: '' }, body: 'body', createdAt: '2026-01-01T00:00:00.000Z', resolved: false, replies: [] },
          { id: 'd', quote: 'four', quoteContext: { prefix: '', suffix: '' }, author: { login: 'u', avatarUrl: '' }, body: 'body', createdAt: '2026-01-01T00:00:00.000Z', resolved: false, replies: [] },
        ],
      }),
      'utf8',
    );

    const entries = await listReviewEntries(basePath);

    expect(entries).toEqual([
      { path: 'docs/arch.md', unresolvedCount: 2 },
      { path: 'README.md', unresolvedCount: 1 },
    ]);
  });

  it('returns no review entries when the comments directory is missing', async () => {
    await expect(listReviewEntries(basePath)).resolves.toEqual([]);
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
