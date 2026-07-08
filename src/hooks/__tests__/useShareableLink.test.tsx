// @vitest-environment jsdom

import { render, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const authState = vi.hoisted(() => ({
  repo: { owner: 'acme', repo: 'proj' } as {
    owner: string;
    repo: string;
  } | null,
  branch: 'review-1' as string | null,
  updateRepo: vi.fn(),
  setBranch: vi.fn(),
}));

vi.mock('../useAuth', () => ({
  useAuth: () => authState,
}));

import { ShareableLinkBridge } from '../../components/ShareableLinkBridge';
import { useShareableLink } from '../useShareableLink';

function routerWrapper(initialEntry: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    );
  };
}

describe('useShareableLink', () => {
  beforeEach(() => {
    authState.repo = { owner: 'acme', repo: 'proj' };
    authState.branch = 'review-1';
    authState.updateRepo.mockReset();
    authState.setBranch.mockReset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    window.history.replaceState(null, '', '/redraft/');
  });

  it('parses repo and branch from router search params', () => {
    const { result } = renderHook(() => useShareableLink(), {
      wrapper: routerWrapper('/d/docs/spec.md?repo=octo/repo&branch=topic'),
    });

    expect(result.current.urlRepo).toEqual({ owner: 'octo', repo: 'repo' });
    expect(result.current.urlBranch).toBe('topic');
  });

  it('builds a document link with repo and branch params but no PAT', () => {
    const { result } = renderHook(() => useShareableLink(), {
      wrapper: routerWrapper('/d/docs/spec.md'),
    });

    const link = result.current.buildLink('docs/spec.md');

    expect(link).toBe(
      `${window.location.origin}/redraft/#/d/docs/spec.md?repo=acme/proj&branch=review-1`,
    );
    expect(link).not.toContain('ghp_');
  });

  it('builds a context link when no document path is provided', () => {
    const { result } = renderHook(() => useShareableLink(), {
      wrapper: routerWrapper('/'),
    });

    expect(result.current.buildLink()).toBe(
      `${window.location.origin}/redraft/#/?repo=acme/proj&branch=review-1`,
    );
  });

  it('copies the built link to the clipboard', async () => {
    const { result } = renderHook(() => useShareableLink(), {
      wrapper: routerWrapper('/d/docs/spec.md'),
    });

    await expect(result.current.copyLink('docs/spec.md')).resolves.toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/redraft/#/d/docs/spec.md?repo=acme/proj&branch=review-1`,
    );
  });

  it('returns false when clipboard writing fails', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error('denied'),
    );
    const { result } = renderHook(() => useShareableLink(), {
      wrapper: routerWrapper('/d/docs/spec.md'),
    });

    await expect(result.current.copyLink('docs/spec.md')).resolves.toBe(false);
  });
});

describe('ShareableLinkBridge', () => {
  beforeEach(() => {
    authState.repo = { owner: 'acme', repo: 'proj' };
    authState.branch = 'main';
    authState.updateRepo.mockReset();
    authState.setBranch.mockReset();
  });

  it('updates repo with override branch when URL repo differs', async () => {
    authState.repo = { owner: 'other', repo: 'repo' };

    render(
      <MemoryRouter
        initialEntries={['/d/spec.md?repo=acme/proj&branch=review-1']}
      >
        <ShareableLinkBridge />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(authState.updateRepo).toHaveBeenCalledWith(
        'acme',
        'proj',
        undefined,
        'review-1',
      );
    });
    expect(authState.setBranch).not.toHaveBeenCalled();
  });

  it('updates branch when URL repo already matches current repo', async () => {
    render(
      <MemoryRouter
        initialEntries={['/d/spec.md?repo=acme/proj&branch=review-1']}
      >
        <ShareableLinkBridge />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(authState.setBranch).toHaveBeenCalledWith('review-1');
    });
    expect(authState.updateRepo).not.toHaveBeenCalled();
  });
});
