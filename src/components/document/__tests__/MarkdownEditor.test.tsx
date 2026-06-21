// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';

const updateFile = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/github/client', () => ({
  ConflictError: class ConflictError extends Error {},
  GitHubClient: class GitHubClient {
    updateFile = updateFile;
  },
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

import { AuthProvider } from '../../../hooks/useAuth';
import { MarkdownEditor } from '../MarkdownEditor';
import { useProposalEdit } from '../../../hooks/useProposalEdit';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function setStoredAuth() {
  localStorage.setItem(
    'proposal-review.auth',
    JSON.stringify({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(AuthProvider, null, children),
  );
}

describe('MarkdownEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    updateFile.mockReset();
    navigate.mockReset();
    showToast.mockReset();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it('renders content and saves edits', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MarkdownEditor
        initialContent="# Proposal"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText(/markdown editor/i), {
      target: { value: '# Proposal\n\nUpdated' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    expect(onSave).toHaveBeenCalledWith('# Proposal\n\nUpdated');
    expect(screen.getByText(/characters/i)).toBeInTheDocument();
    expect(screen.getByText(/lines/i)).toBeInTheDocument();
  });

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn();

    render(
      <MarkdownEditor
        initialContent="# Proposal"
        isSaving={false}
        onCancel={onCancel}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('inserts two spaces when tab is pressed', () => {
    render(
      <MarkdownEditor
        initialContent="# Proposal"
        isSaving={false}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(
      /markdown editor/i,
    ) as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea.value.endsWith('  ')).toBe(true);
  });

  it('confirms before discarding unsaved changes', () => {
    const onCancel = vi.fn();

    render(
      <MarkdownEditor
        initialContent="# Proposal"
        isSaving={false}
        onCancel={onCancel}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/markdown editor/i), {
      target: { value: '# Proposal\n\nUpdated' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(window.confirm).toHaveBeenCalledWith(
      'You have unsaved changes. Discard?',
    );
    expect(onCancel).toHaveBeenCalled();
  });

  it('useProposalEdit saves with the right args and navigates back', async () => {
    updateFile.mockResolvedValueOnce({ sha: 'next-sha' });

    const { result } = renderHook(() => useProposalEdit('proposals/doc.md'), {
      wrapper,
    });

    await act(async () => {
      await result.current.save('# Updated', 'current-sha');
    });

    expect(updateFile).toHaveBeenCalledWith(
      'proposals/doc.md',
      '# Updated',
      'current-sha',
      'Update proposal: doc.md',
    );
    expect(navigate).toHaveBeenCalledWith('/proposals/doc.md');
    expect(showToast).toHaveBeenCalledWith({
      tone: 'info',
      title: 'Proposal saved',
    });
  });

  it('useProposalEdit shows a conflict toast on write failure', async () => {
    updateFile.mockRejectedValueOnce(new Error('GitHub content SHA conflict'));

    const { result } = renderHook(() => useProposalEdit('proposals/doc.md'), {
      wrapper,
    });

    await act(async () => {
      await result.current.save('# Updated', 'current-sha');
    });

    expect(showToast).toHaveBeenCalledWith({
      tone: 'error',
      title:
        'File was modified since you loaded it. Please refresh and re-apply your changes.',
    });
  });
});
