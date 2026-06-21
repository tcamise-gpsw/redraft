// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearStoredAuth, getStoredAuth, setStoredAuth } from '../storage';

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
});
