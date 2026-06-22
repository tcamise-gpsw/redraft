// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const instances: MockOctokit[] = [];

  class MockOctokit {
    auth: string;
    baseUrl?: string;
    users = {
      getAuthenticated: vi.fn(),
    };
    git = {
      getTree: vi.fn(),
    };
    repos = {
      getContent: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
      listCommits: vi.fn(),
    };

    constructor(options: { auth: string; baseUrl?: string }) {
      this.auth = options.auth;
      this.baseUrl = options.baseUrl;
      instances.push(this);
    }
  }

  return { instances, MockOctokit };
});

vi.mock('@octokit/rest', () => ({
  Octokit: state.MockOctokit,
}));

import {
  AuthError,
  ConflictError,
  GitHubClient,
  NetworkError,
  NotFoundError,
  RateLimitError,
} from '../client';

const responseHeaders = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4992',
  'x-ratelimit-reset': '1893456000',
};

describe('GitHubClient', () => {
  beforeEach(() => {
    state.instances.length = 0;
    vi.clearAllMocks();
  });

  it('constructs an Octokit instance with the provided PAT', () => {
    new GitHubClient({ pat: 'ghp_test', owner: 'acme', repo: 'workspace' });

    expect(state.instances).toHaveLength(1);
    expect(state.instances[0]?.auth).toBe('ghp_test');
  });

  it('forwards a custom base URL to Octokit when provided', () => {
    new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      baseUrl: 'http://127.0.0.1:4200/api/github',
    });

    expect(state.instances[0]?.baseUrl).toBe(
      'http://127.0.0.1:4200/api/github',
    );
  });

  it('validateAuth returns normalized user data on success', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.users.getAuthenticated.mockResolvedValue({
      data: { login: 'jdoe', avatar_url: 'https://example.com/avatar.png' },
      headers: responseHeaders,
    });

    await expect(client.validateAuth()).resolves.toEqual({
      login: 'jdoe',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(client.getRateLimit()).toEqual({
      limit: 5000,
      remaining: 4992,
      reset: new Date('2030-01-01T00:00:00.000Z'),
    });
  });

  it('validateAuth throws AuthError on 401', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.users.getAuthenticated.mockRejectedValue({
      status: 401,
      response: { headers: responseHeaders },
    });

    await expect(client.validateAuth()).rejects.toBeInstanceOf(AuthError);
  });

  it('getTree includes markdown blobs and comment sidecars, excludes other files', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { path: 'docs/auth-overhaul.md', type: 'blob' },
          { path: 'docs', type: 'tree' },
          { path: 'README.md', type: 'blob' },
          {
            path: '.redraft/comments/docs/auth-overhaul.comments.json',
            type: 'blob',
          },
          { path: '.redraft/other-metadata.json', type: 'blob' },
          { path: 'notes.txt', type: 'blob' },
        ],
      },
      headers: responseHeaders,
    });

    await expect(client.getTree()).resolves.toEqual([
      { path: 'docs/auth-overhaul.md', type: 'blob' },
      { path: 'README.md', type: 'blob' },
      {
        path: '.redraft/comments/docs/auth-overhaul.comments.json',
        type: 'blob',
      },
    ]);
  });

  it('getFileContent decodes base64 and returns sha', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        sha: 'doc-sha',
        content: Buffer.from('# Draft\n', 'utf8').toString('base64'),
      },
      headers: responseHeaders,
    });

    await expect(client.getFileContent('docs/doc.md')).resolves.toEqual({
      content: '# Draft\n',
      sha: 'doc-sha',
    });
  });

  it('getFileContent returns null for optional 404 reads', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.getContent.mockRejectedValue({
      status: 404,
      response: { headers: responseHeaders },
    });

    await expect(
      client.getFileContent('docs/missing.md', { optional: true }),
    ).resolves.toBeNull();
  });

  it('getFileContent throws NotFoundError for required 404 reads', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.getContent.mockRejectedValue({
      status: 404,
      response: { headers: responseHeaders },
    });

    await expect(
      client.getFileContent('docs/missing.md'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('createFile writes without sha and returns the new sha', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.createOrUpdateFileContents.mockResolvedValue({
      data: {
        content: {
          sha: 'new-sha',
        },
      },
      headers: responseHeaders,
    });

    await expect(
      client.createFile('docs/new.md', '# Draft\n', 'Add document'),
    ).resolves.toEqual({ sha: 'new-sha' });
    expect(octokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'docs/new.md',
        message: 'Add document',
      }),
    );
  });

  it('updateFile sends sha and throws ConflictError on mismatch', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.createOrUpdateFileContents.mockRejectedValue({
      status: 409,
      response: { headers: responseHeaders },
    });

    await expect(
      client.updateFile('docs/doc.md', '# Updated\n', 'doc-sha', 'Update'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('getLatestCommit returns the newest commit info for a path', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.listCommits.mockResolvedValue({
      data: [
        {
          commit: {
            message: 'Update document',
            author: { date: '2026-06-21T05:00:00Z' },
          },
          author: {
            login: 'jdoe',
            avatar_url: 'https://example.com/avatar.png',
          },
        },
      ],
      headers: responseHeaders,
    });

    await expect(client.getLatestCommit('docs/doc.md')).resolves.toEqual({
      author: {
        login: 'jdoe',
        avatarUrl: 'https://example.com/avatar.png',
      },
      date: '2026-06-21T05:00:00Z',
      message: 'Update document',
    });
  });

  it('classifies 403 responses with rate-limit headers as RateLimitError', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.users.getAuthenticated.mockRejectedValue({
      status: 403,
      response: {
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1893456000',
        },
      },
    });

    await expect(client.validateAuth()).rejects.toBeInstanceOf(RateLimitError);
  });

  it('wraps unknown transport failures as NetworkError', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.users.getAuthenticated.mockRejectedValue(
      new Error('socket hang up'),
    );

    await expect(client.validateAuth()).rejects.toEqual(
      new NetworkError('socket hang up'),
    );
  });
});
