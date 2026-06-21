// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const instances: MockOctokit[] = [];

  class MockOctokit {
    auth: string;
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

    constructor(options: { auth: string }) {
      this.auth = options.auth;
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
      status: 200,
    });

    await expect(client.validateAuth()).resolves.toEqual({
      login: 'jdoe',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(client.getRateLimit()).toMatchObject({
      remaining: 4992,
      limit: 5000,
    });
  });

  it('validateAuth throws AuthError on 401', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.users.getAuthenticated.mockRejectedValue({ status: 401 });

    await expect(client.validateAuth()).rejects.toBeInstanceOf(AuthError);
  });

  it('getTree filters entries to the proposals prefix', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { path: 'README.md', type: 'blob' },
          { path: 'proposals/camera-session.md', type: 'blob' },
          { path: 'proposals/media', type: 'tree' },
        ],
      },
      headers: responseHeaders,
      status: 200,
    });

    await expect(client.getTree()).resolves.toEqual([
      { path: 'proposals/camera-session.md', type: 'blob' },
      { path: 'proposals/media', type: 'tree' },
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
        sha: 'abc123',
        content: btoa('hello markdown'),
      },
      headers: responseHeaders,
      status: 200,
    });

    await expect(client.getFileContent('proposals/doc.md')).resolves.toEqual({
      content: 'hello markdown',
      sha: 'abc123',
    });
  });

  it('getFileContent returns null for optional 404 reads', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.getContent.mockRejectedValue({ status: 404 });

    await expect(
      client.getFileContent('proposals/missing.comments.json', {
        optional: true,
      }),
    ).resolves.toBeNull();
  });

  it('getFileContent throws NotFoundError for required 404 reads', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.getContent.mockRejectedValue({ status: 404 });

    await expect(
      client.getFileContent('proposals/missing.md'),
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
      data: { content: { sha: 'new-sha' } },
      headers: responseHeaders,
      status: 201,
    });

    await expect(
      client.createFile('proposals/new.md', '# New', 'Create proposal: new.md'),
    ).resolves.toEqual({ sha: 'new-sha' });
    expect(octokit.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'workspace',
        path: 'proposals/new.md',
        message: 'Create proposal: new.md',
      }),
    );
    expect(
      octokit.repos.createOrUpdateFileContents.mock.calls[0]?.[0],
    ).not.toHaveProperty('sha');
  });

  it('updateFile sends sha and throws ConflictError on mismatch', async () => {
    const client = new GitHubClient({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
    });
    const octokit = state.instances[0]!;

    octokit.repos.createOrUpdateFileContents.mockRejectedValue({
      status: 422,
      message: 'sha does not match',
      response: { headers: responseHeaders },
    });

    await expect(
      client.updateFile(
        'proposals/doc.md',
        '# Updated',
        'old-sha',
        'Update proposal: doc.md',
      ),
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
            message: 'Update proposal',
            author: { date: '2026-06-21T05:00:00Z' },
          },
          author: {
            login: 'jdoe',
            avatar_url: 'https://example.com/avatar.png',
          },
        },
      ],
      headers: responseHeaders,
      status: 200,
    });

    await expect(client.getLatestCommit('proposals/doc.md')).resolves.toEqual({
      author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
      date: '2026-06-21T05:00:00Z',
      message: 'Update proposal',
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
          ...responseHeaders,
          'x-ratelimit-remaining': '0',
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

    await expect(client.validateAuth()).rejects.toBeInstanceOf(NetworkError);
  });
});
