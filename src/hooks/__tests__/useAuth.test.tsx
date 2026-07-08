// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateAuth = vi.hoisted(() => vi.fn());
const getDefaultBranch = vi.hoisted(() => vi.fn());
const isLocalMode = vi.hoisted(() => vi.fn());
const getApiBaseUrl = vi.hoisted(() => vi.fn());

vi.mock('../../lib/github', () => ({
  AuthError: class AuthError extends Error {},
  GitHubClient: class GitHubClient {
    validateAuth = validateAuth;
    getDefaultBranch = getDefaultBranch;
  },
}));

vi.mock('../../lib/mode', () => ({
  isLocalMode,
  getApiBaseUrl,
}));

import { AuthProvider, BRANCH_WARNING_EVENT, useAuth } from '../useAuth';

interface TestAuthContextValue {
  user: { login: string; avatarUrl: string } | null;
  pat: string | null;
  repo: { owner: string; repo: string } | null;
  isAuthenticated: boolean;
  login: (pat: string, owner: string, repo: string) => Promise<void>;
  logout: () => void;
  updateRepo: (owner: string, repo: string, sidecarBranch?: string) => void;
  branch: string | null;
  defaultBranch: string | null;
  sidecarBranch: string | null;
  setBranch: (name: string) => void;
  setSidecarBranch: (name: string) => void;
}

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(AuthProvider, null, children);
}

function authState(value: unknown): TestAuthContextValue {
  return value as TestAuthContextValue;
}

describe('useAuth branch state', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    validateAuth.mockReset().mockResolvedValue({
      login: 'jdoe',
      avatarUrl: 'https://example.com/avatar.png',
    });
    getDefaultBranch.mockReset().mockResolvedValue('main');
    isLocalMode.mockReset().mockReturnValue(false);
    getApiBaseUrl.mockReset().mockReturnValue('https://api.github.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login uses the repository default branch when no persisted override exists', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    expect(authState(result.current).defaultBranch).toBe('main');
    expect(authState(result.current).branch).toBe('main');
  });

  it('login restores a persisted branch override for the authenticated repository', async () => {
    localStorage.setItem(
      'redraft.branch.acme/workspace',
      JSON.stringify('release/2026.07'),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    expect(authState(result.current).defaultBranch).toBe('main');
    expect(authState(result.current).branch).toBe('release/2026.07');
  });

  it('setBranch updates the active branch and persists it for the current repository', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    act(() => {
      authState(result.current).setBranch('release/2026.08');
    });

    expect(authState(result.current).branch).toBe('release/2026.08');
    expect(localStorage.getItem('redraft.branch.acme/workspace')).toBe(
      JSON.stringify('release/2026.08'),
    );
  });

  it('detects the active git branch in local mode and ignores branch setters', async () => {
    isLocalMode.mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ branch: 'feature/local-docs' }),
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() =>
      expect(authState(result.current).branch).toBe('feature/local-docs'),
    );
    expect(authState(result.current).defaultBranch).toBeNull();
    expect(authState(result.current).sidecarBranch).toBeNull();

    act(() => {
      authState(result.current).setBranch('release/2026.09');
      authState(result.current).setSidecarBranch('review-data');
    });

    expect(authState(result.current).branch).toBe('feature/local-docs');
    expect(authState(result.current).defaultBranch).toBeNull();
    expect(authState(result.current).sidecarBranch).toBeNull();
    expect(localStorage.getItem('redraft.branch.local/redraft')).toBeNull();
    expect(
      localStorage.getItem('redraft.sidecarBranch.local/redraft'),
    ).toBeNull();
  });

  it('falls back to main for local mode namespacing when git branch detection fails', async () => {
    isLocalMode.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(authState(result.current).branch).toBe('main'));
    expect(authState(result.current).sidecarBranch).toBeNull();
  });

  it('falls back to main for local mode namespacing when git reports detached HEAD', async () => {
    isLocalMode.mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ branch: 'HEAD' }),
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(authState(result.current).branch).toBe('main'));
    expect(authState(result.current).sidecarBranch).toBeNull();
  });

  it('login defaults sidecarBranch to redraft when no persisted override exists', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    expect(authState(result.current).sidecarBranch).toBe('redraft');
  });

  it('login restores a persisted sidecar branch override for the authenticated repository', async () => {
    localStorage.setItem(
      'redraft.sidecarBranch.acme/workspace',
      JSON.stringify('review-data'),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    expect(authState(result.current).sidecarBranch).toBe('review-data');
  });

  it('setSidecarBranch updates the active sidecar branch and persists it', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    act(() => {
      authState(result.current).setSidecarBranch('review-data');
    });

    expect(authState(result.current).sidecarBranch).toBe('review-data');
    expect(localStorage.getItem('redraft.sidecarBranch.acme/workspace')).toBe(
      JSON.stringify('review-data'),
    );
  });

  it('updateRepo persists the submitted sidecar branch for the target repository', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    act(() => {
      authState(result.current).updateRepo('octo', 'project', 'review-data');
    });

    await waitFor(() => {
      expect(authState(result.current).repo).toEqual({
        owner: 'octo',
        repo: 'project',
      });
      expect(authState(result.current).sidecarBranch).toBe('review-data');
    });
    expect(localStorage.getItem('redraft.sidecarBranch.octo/project')).toBe(
      JSON.stringify('review-data'),
    );
  });
  it('restores persisted branch from localStorage on mount with stored auth', async () => {
    localStorage.setItem(
      'redraft.auth',
      JSON.stringify({
        pat: 'ghp_test',
        owner: 'acme',
        repo: 'workspace',
        user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
      }),
    );
    localStorage.setItem(
      'redraft.branch.acme/workspace',
      JSON.stringify('feature/my-branch'),
    );
    localStorage.setItem(
      'redraft.sidecarBranch.acme/workspace',
      JSON.stringify('review-data'),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() =>
      expect(authState(result.current).branch).toBe('feature/my-branch'),
    );
    expect(authState(result.current).defaultBranch).toBe('main');
    expect(authState(result.current).sidecarBranch).toBe('review-data');
  });

  it('dispatches BRANCH_WARNING_EVENT and falls back to stored branch when getDefaultBranch fails', async () => {
    getDefaultBranch.mockReset().mockRejectedValue(new Error('network error'));
    localStorage.setItem(
      'redraft.branch.acme/workspace',
      JSON.stringify('feature/fallback'),
    );

    const warned: Event[] = [];
    const handler = (e: Event) => warned.push(e);
    window.addEventListener(BRANCH_WARNING_EVENT, handler);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    window.removeEventListener(BRANCH_WARNING_EVENT, handler);

    expect(warned.length).toBeGreaterThanOrEqual(1);
    expect(authState(result.current).defaultBranch).toBeNull();
    expect(authState(result.current).branch).toBe('feature/fallback');
    expect(authState(result.current).sidecarBranch).toBe('redraft');
  });

  it('resets both branch and defaultBranch to null after logout', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    expect(authState(result.current).branch).toBe('main');
    expect(authState(result.current).sidecarBranch).toBe('redraft');

    act(() => {
      authState(result.current).logout();
    });

    expect(authState(result.current).branch).toBeNull();
    expect(authState(result.current).defaultBranch).toBeNull();
    expect(authState(result.current).sidecarBranch).toBeNull();
  });

  it('updateRepo resets branch state then resolves to new repo default', async () => {
    // Use default mock ('main') so all login + side-effect calls resolve to 'main'.
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await authState(result.current).login('ghp_test', 'acme', 'workspace');
    });

    // Wait for all effects to settle on 'main' before changing the mock.
    await waitFor(() => expect(authState(result.current).branch).toBe('main'));

    // Now any new getDefaultBranch call (from updateRepo's loadBranchState) returns 'develop'.
    getDefaultBranch.mockResolvedValue('develop');

    localStorage.setItem(
      'redraft.sidecarBranch.acme/platform',
      JSON.stringify('platform-reviews'),
    );
    act(() => {
      authState(result.current).updateRepo('acme', 'platform');
    });

    await waitFor(() =>
      expect(authState(result.current).branch).toBe('develop'),
    );
    expect(authState(result.current).defaultBranch).toBe('develop');
    expect(authState(result.current).sidecarBranch).toBe('platform-reviews');
  });
});
