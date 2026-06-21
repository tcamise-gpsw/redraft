import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildReDraftApp } from './app.js';

describe('buildReDraftApp', () => {
  let basePath: string;
  let uiRoot: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'redraft-app-'));
    basePath = join(root, 'proposals');
    uiRoot = join(root, 'dist');

    await mkdir(basePath, { recursive: true });
    await mkdir(join(uiRoot, 'assets'), { recursive: true });
    await writeFile(join(basePath, 'auth-overhaul.md'), '# Auth\n', 'utf8');
    await writeFile(
      join(uiRoot, 'index.html'),
      '<!doctype html><html><head><title>ReDraft</title></head><body><div id="root"></div></body></html>',
      'utf8',
    );
    await writeFile(
      join(uiRoot, 'assets', 'app.js'),
      'console.log("ok")',
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(join(basePath, '..'), { recursive: true, force: true });
  });

  it('mounts the GitHub-style API routes', async () => {
    const app = buildReDraftApp({ basePath, uiRoot });

    const response = await app.request('http://local.test/api/github/user');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ login: 'local-user', avatar_url: '' });
  });

  it('serves index.html at the root with the local mode meta tag injected', async () => {
    const app = buildReDraftApp({ basePath, uiRoot });

    const response = await app.request('http://local.test/');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('<meta name="redraft-mode" content="local">');
    expect(body).toContain('<div id="root"></div>');
  });

  it('serves built asset files without rewriting them', async () => {
    const app = buildReDraftApp({ basePath, uiRoot });

    const response = await app.request('http://local.test/assets/app.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    await expect(response.text()).resolves.toBe('console.log("ok")');
  });

  it('falls back to index.html for unknown non-api routes', async () => {
    const app = buildReDraftApp({ basePath, uiRoot });

    const response = await app.request(
      'http://local.test/proposals/auth-overhaul',
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<meta name="redraft-mode" content="local">');
  });
});
