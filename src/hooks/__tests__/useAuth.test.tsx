// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
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

import { AuthProvider, useAuth } from '../useAuth';

interface TestAuthContextValue {
  user: { login: string; avatarUrl: string } | null;
  pat: string | null;
  repo: { owner: string; repo: string } | null;
  isAuthenticated: boolean;
  login: (pat: string, owner: string, repo: string) => Promise<void>;
  logout: () => void;
  updateRepo: (owner: string, repo: string) => void;
  branch: string | null;
  defaultBranch: string | null;
  setBranch: (name: string) => void;
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

  it('keeps branch state null in local mode and ignores setBranch calls', () => {
    isLocalMode.mockReturnValue(true);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(authState(result.current).branch).toBeNull();
    expect(authState(result.current).defaultBranch).toBeNull();

    act(() => {
      authState(result.current).setBranch('release/2026.09');
    });

    expect(authState(result.current).branch).toBeNull();
    expect(authState(result.current).defaultBranch).toBeNull();
    expect(localStorage.getItem('redraft.branch.local/redraft')).toBeNull();
  });
});
