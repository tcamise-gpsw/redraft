import { describe, expect, it } from 'vitest';

import { commentPath, sanitizeBranch } from '../paths';

describe('comment path utilities', () => {
  it('leaves branch names without slashes unchanged', () => {
    expect(sanitizeBranch('main')).toBe('main');
  });

  it('replaces slashes in branch names with double dashes', () => {
    expect(sanitizeBranch('feature/auth')).toBe('feature--auth');
    expect(sanitizeBranch('release/2026/07')).toBe('release--2026--07');
  });

  it('prefixes comment sidecars with the sanitized document branch', () => {
    expect(commentPath('docs/auth.md', 'main')).toBe(
      '.redraft/comments/main/docs/auth.comments.json',
    );
    expect(commentPath('docs/auth.md', 'feature/auth')).toBe(
      '.redraft/comments/feature--auth/docs/auth.comments.json',
    );
  });
});
