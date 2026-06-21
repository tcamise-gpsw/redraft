// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';

const getFileContent = vi.hoisted(() => vi.fn());
const getLatestCommit = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/github/client', () => ({
  GitHubClient: class GitHubClient {
    getFileContent = getFileContent;
    getLatestCommit = getLatestCommit;
  },
}));

import { AuthProvider } from '../../../hooks/useAuth';
import { ActivityIndicator } from '../ActivityIndicator';
import { DocumentView } from '../DocumentView';
import { MarkdownRenderer } from '../MarkdownRenderer';

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

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>{node}</HashRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Markdown document viewer', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    getFileContent.mockReset();
    getLatestCommit.mockReset();
  });

  it('renders markdown, code blocks, and tables', () => {
    const { container } = render(
      <MarkdownRenderer
        content={
          '# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 1;\n```'
        }
        comments={[]}
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(container.querySelector('pre code')?.textContent).toContain(
      'const value = 1;',
    );
  });

  it('renders an activity indicator when commit info exists', () => {
    render(
      <ActivityIndicator
        commit={{
          author: {
            login: 'jdoe',
            avatarUrl: 'https://example.com/avatar.png',
          },
          date: '2026-06-21T05:00:00Z',
          message: 'Update proposal',
        }}
      />,
    );

    expect(screen.getByText(/last edited by/i)).toBeInTheDocument();
    expect(screen.getByText(/@jdoe/i)).toBeInTheDocument();
  });

  it('loads proposal content and tolerates missing comments sidecars', async () => {
    getFileContent
      .mockResolvedValueOnce({ content: '# Proposal', sha: 'doc-sha' })
      .mockResolvedValueOnce(null);
    getLatestCommit.mockResolvedValueOnce(null);

    renderWithProviders(
      <DocumentView
        path="proposals/doc.md"
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Proposal' }),
    ).toBeInTheDocument();
    expect(getFileContent).toHaveBeenNthCalledWith(
      2,
      'proposals/doc.comments.json',
      { optional: true },
    );
  });

  it('shows an error state when the proposal content request fails', async () => {
    getFileContent.mockRejectedValueOnce(new Error('boom'));
    getLatestCommit.mockResolvedValueOnce(null);

    renderWithProviders(
      <DocumentView
        path="proposals/doc.md"
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/unable to load proposal/i),
    ).toBeInTheDocument();
  });

  it('fires onSelectComment when a highlighted comment is clicked', async () => {
    const onSelectComment = vi.fn();

    render(
      <MarkdownRenderer
        content={'The camera should initialize lazily.'}
        comments={[
          {
            id: 'comment-1',
            quote: 'initialize lazily',
            quoteContext: { prefix: '', suffix: '' },
            author: { login: 'jdoe', avatarUrl: '' },
            body: 'Question',
            createdAt: '2026-06-21T05:00:00Z',
            resolved: false,
            replies: [],
          },
        ]}
        onSelectComment={onSelectComment}
        onTextSelect={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByText(
        (_, element) => element?.textContent === 'initialize lazily',
      ),
    );
    await waitFor(() => {
      expect(onSelectComment).toHaveBeenCalledWith('comment-1');
    });
  });
});
