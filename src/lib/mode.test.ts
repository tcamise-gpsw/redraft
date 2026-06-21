// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { getApiBaseUrl, isLocalMode } from './mode';

function setModeMeta(content: string | null) {
  document.head
    .querySelector('meta[name="draftspace-mode"]')
    ?.remove();

  if (content) {
    const meta = document.createElement('meta');
    meta.name = 'draftspace-mode';
    meta.content = content;
    document.head.appendChild(meta);
  }
}

describe('mode helpers', () => {
  afterEach(() => {
    setModeMeta(null);
  });

  it('detects local mode only when the meta tag is present and set to local', () => {
    expect(isLocalMode()).toBe(false);

    setModeMeta('local');
    expect(isLocalMode()).toBe(true);

    setModeMeta('remote');
    expect(isLocalMode()).toBe(false);
  });

  it('returns the local API base URL when local mode is active', () => {
    setModeMeta('local');

    expect(getApiBaseUrl()).toBe(`${window.location.origin}/api/github`);
  });

  it('returns the GitHub API origin in remote mode', () => {
    expect(getApiBaseUrl()).toBe('https://api.github.com');
  });
});
