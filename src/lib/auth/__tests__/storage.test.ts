// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoredAuth,
  getStoredAuth,
  getStoredBranch,
  getStoredSidecarBranch,
  setStoredAuth,
  setStoredBranch,
  setStoredSidecarBranch,
} from '../storage';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe('auth storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
  });

  it('round-trips auth data through localStorage', () => {
    setStoredAuth({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    });

    expect(getStoredAuth()).toEqual({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    });
  });

  it('returns null when nothing is stored', () => {
    expect(getStoredAuth()).toBeNull();
  });

  it('clears stored auth', () => {
    setStoredAuth({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    });

    clearStoredAuth();

    expect(getStoredAuth()).toBeNull();
  });

  it('round-trips a repo-specific branch selection through the branch storage key', () => {
    setStoredBranch('acme', 'workspace', 'release/2026.07');

    expect(localStorage.getItem('redraft.branch.acme/workspace')).toBe(
      JSON.stringify('release/2026.07'),
    );
    expect(getStoredBranch('acme', 'workspace')).toBe('release/2026.07');
  });

  it('returns null when no branch is stored for the requested repo', () => {
    expect(getStoredBranch('acme', 'workspace')).toBeNull();
  });

  it('stores branch selections independently per repository', () => {
    setStoredBranch('acme', 'workspace', 'main');
    setStoredBranch('acme', 'platform', 'release');

    expect(getStoredBranch('acme', 'workspace')).toBe('main');
    expect(getStoredBranch('acme', 'platform')).toBe('release');
    expect(localStorage.getItem('redraft.branch.acme/workspace')).toBe(
      JSON.stringify('main'),
    );
    expect(localStorage.getItem('redraft.branch.acme/platform')).toBe(
      JSON.stringify('release'),
    );
  });

  it('round-trips a repo-specific sidecar branch through the sidecar storage key', () => {
    setStoredSidecarBranch('acme', 'workspace', 'redraft');

    expect(localStorage.getItem('redraft.sidecarBranch.acme/workspace')).toBe(
      JSON.stringify('redraft'),
    );
    expect(getStoredSidecarBranch('acme', 'workspace')).toBe('redraft');
  });

  it('returns null when no sidecar branch is stored for the requested repo', () => {
    expect(getStoredSidecarBranch('acme', 'workspace')).toBeNull();
  });

  it('stores sidecar branch selections independently per repository', () => {
    setStoredSidecarBranch('acme', 'workspace', 'redraft');
    setStoredSidecarBranch('acme', 'platform', 'review-data');

    expect(getStoredSidecarBranch('acme', 'workspace')).toBe('redraft');
    expect(getStoredSidecarBranch('acme', 'platform')).toBe('review-data');
  });
});
