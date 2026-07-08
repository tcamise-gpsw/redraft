// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { parseShareableParams } from '../url';

describe('parseShareableParams', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('parses repo and branch from hash query params', () => {
    expect(
      parseShareableParams('#/d/spec.md?repo=acme/proj&branch=review-1'),
    ).toEqual({
      repo: { owner: 'acme', repo: 'proj' },
      branch: 'review-1',
    });
  });

  it('returns repo without branch when only repo is present', () => {
    expect(parseShareableParams('#/?repo=acme/proj')).toEqual({
      repo: { owner: 'acme', repo: 'proj' },
      branch: null,
    });
  });

  it('returns branch without repo when only branch is present', () => {
    expect(parseShareableParams('#/d/spec.md?branch=review-1')).toEqual({
      repo: null,
      branch: 'review-1',
    });
  });

  it('returns null params when the hash has no query string', () => {
    expect(parseShareableParams('#/d/spec.md')).toEqual({
      repo: null,
      branch: null,
    });
  });

  it('ignores malformed repo params', () => {
    expect(parseShareableParams('#/?repo=invalid')).toEqual({
      repo: null,
      branch: null,
    });
    expect(parseShareableParams('#/?repo=acme/proj/extra')).toEqual({
      repo: null,
      branch: null,
    });
  });

  it('handles empty hash values', () => {
    expect(parseShareableParams('')).toEqual({ repo: null, branch: null });
  });

  it('defaults to window.location.hash when no hash is passed', () => {
    window.location.hash = '#/d/spec.md?repo=octo/repo&branch=topic';

    expect(parseShareableParams()).toEqual({
      repo: { owner: 'octo', repo: 'repo' },
      branch: 'topic',
    });
  });

  it('decodes URL-encoded repo and branch values', () => {
    expect(
      parseShareableParams('#/d/spec.md?repo=acme%2Fproj&branch=feature%2Fone'),
    ).toEqual({
      repo: { owner: 'acme', repo: 'proj' },
      branch: 'feature/one',
    });
  });
});
