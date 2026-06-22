import { Octokit } from '@octokit/rest';

import { dispatchAuthError } from '../auth/storage';
import type {
  CommitInfo,
  FileContent,
  RateLimitInfo,
  TreeItem,
  User,
} from '../../types/github';

interface GitHubClientOptions {
  pat: string;
  owner: string;
  repo: string;
  baseUrl?: string;
}

interface GetFileOptions {
  optional?: boolean;
}

interface RateLimitHeaders {
  get?: (name: string) => string | null;
  'x-ratelimit-limit'?: string;
  'x-ratelimit-remaining'?: string;
  'x-ratelimit-reset'?: string;
}

export const RATE_LIMIT_EVENT = 'redraft:rate-limit';

export class AuthError extends Error {
  readonly type = 'auth';

  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends Error {
  readonly type = 'not_found';

  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly type = 'conflict';

  constructor(message = 'GitHub content SHA conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  readonly type = 'rate_limit';

  constructor(message = 'GitHub API rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends Error {
  readonly type = 'network';

  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

function decodeBase64(value: string): string {
  const normalized = value.replace(/\n/g, '');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function readHeader(
  headers: RateLimitHeaders | undefined,
  name: keyof Pick<
    RateLimitHeaders,
    'x-ratelimit-limit' | 'x-ratelimit-remaining' | 'x-ratelimit-reset'
  >,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (typeof headers.get === 'function') {
    return headers.get(name) ?? undefined;
  }

  return headers[name];
}

function isRateLimitError(
  status: number | undefined,
  headers: RateLimitHeaders | undefined,
): boolean {
  return status === 403 && readHeader(headers, 'x-ratelimit-remaining') === '0';
}

export class GitHubClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private rateLimit: RateLimitInfo = {
    remaining: 0,
    limit: 0,
    reset: new Date(0),
  };

  constructor({ pat, owner, repo, baseUrl }: GitHubClientOptions) {
    this.octokit = new Octokit({ auth: pat, baseUrl });
    this.owner = owner;
    this.repo = repo;
  }

  getRateLimit(): RateLimitInfo {
    return this.rateLimit;
  }

  async validateAuth(): Promise<User> {
    const response = await this.withErrorHandling(() =>
      this.octokit.users.getAuthenticated(),
    );

    this.updateRateLimit(response.headers);

    return {
      login: response.data.login,
      avatarUrl: response.data.avatar_url,
    };
  }

  async getTree(branch = 'HEAD'): Promise<TreeItem[]> {
    const response = await this.withErrorHandling(() =>
      this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: branch,
        recursive: 'true',
      }),
    );

    this.updateRateLimit(response.headers);

    return (response.data.tree ?? [])
      .filter((item) => {
        if (typeof item.path !== 'string' || item.type !== 'blob') {
          return false;
        }
        // Always include comment sidecars so callers can infer review status
        // from a single tree fetch without probing individual files.
        if (
          item.path.startsWith('.redraft/comments/') &&
          item.path.endsWith('.comments.json')
        ) {
          return true;
        }
        return item.path.endsWith('.md') && !item.path.startsWith('.redraft/');
      })
      .map((item) => ({
        path: item.path,
        type: item.type as 'blob',
      }));
  }

  async getFileContent(
    path: string,
    options?: GetFileOptions,
  ): Promise<FileContent | null> {
    try {
      const response = await this.withErrorHandling(() =>
        this.octokit.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
        }),
      );

      this.updateRateLimit(response.headers);

      if (!('content' in response.data) || response.data.type !== 'file') {
        throw new NotFoundError(`GitHub path is not a file: ${path}`);
      }

      return {
        content: decodeBase64(response.data.content),
        sha: response.data.sha,
      };
    } catch (error) {
      if (options?.optional && error instanceof NotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async createFile(
    path: string,
    content: string,
    message: string,
  ): Promise<{ sha: string }> {
    const response = await this.withErrorHandling(() =>
      this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: encodeBase64(content),
      }),
    );

    this.updateRateLimit(response.headers);

    return {
      sha: response.data.content?.sha ?? '',
    };
  }

  async updateFile(
    path: string,
    content: string,
    sha: string,
    message: string,
  ): Promise<{ sha: string }> {
    const response = await this.withErrorHandling(() =>
      this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        sha,
        content: encodeBase64(content),
      }),
    );

    this.updateRateLimit(response.headers);

    return {
      sha: response.data.content?.sha ?? '',
    };
  }

  async getLatestCommit(path: string): Promise<CommitInfo | null> {
    const response = await this.withErrorHandling(() =>
      this.octokit.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        path,
        per_page: 1,
      }),
    );

    this.updateRateLimit(response.headers);

    const [commit] = response.data;

    if (!commit?.author || !commit.commit.author?.date) {
      return null;
    }

    return {
      author: {
        login: commit.author.login,
        avatarUrl: commit.author.avatar_url,
      },
      date: commit.commit.author.date,
      message: commit.commit.message,
    };
  }

  private updateRateLimit(headers: RateLimitHeaders | undefined): void {
    if (!headers) {
      return;
    }

    const limit = Number(readHeader(headers, 'x-ratelimit-limit'));
    const remaining = Number(readHeader(headers, 'x-ratelimit-remaining'));
    const reset = Number(readHeader(headers, 'x-ratelimit-reset'));

    if (
      Number.isFinite(limit) &&
      Number.isFinite(remaining) &&
      Number.isFinite(reset)
    ) {
      this.rateLimit = {
        limit,
        remaining,
        reset: new Date(reset * 1000),
      };

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(RATE_LIMIT_EVENT, { detail: this.rateLimit }),
        );
      }
    }
  }

  private async withErrorHandling<T extends { headers?: RateLimitHeaders }>(
    request: () => Promise<T>,
  ): Promise<T> {
    if (
      this.rateLimit.limit > 0 &&
      this.rateLimit.remaining === 0 &&
      this.rateLimit.reset.getTime() > Date.now()
    ) {
      throw new RateLimitError(
        `GitHub API rate limit exceeded. Resets at ${this.rateLimit.reset.toISOString()}`,
      );
    }

    try {
      return await request();
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): Error {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number(error.status)
        : undefined;
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : undefined;
    const responseHeaders =
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'headers' in error.response
        ? (error.response.headers as RateLimitHeaders)
        : undefined;

    this.updateRateLimit(responseHeaders);

    if (isRateLimitError(status, responseHeaders)) {
      return new RateLimitError();
    }

    if (status === 401) {
      if (typeof window !== 'undefined') {
        dispatchAuthError();
      }
      return new AuthError();
    }

    if (status === 404) {
      return new NotFoundError();
    }

    if (
      status === 409 ||
      (status === 422 && message?.toLowerCase().includes('sha'))
    ) {
      return new ConflictError();
    }

    if (error instanceof Error) {
      return new NetworkError(error.message);
    }

    return new NetworkError();
  }
}
