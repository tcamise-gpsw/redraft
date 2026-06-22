// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';

const getTree = vi.hoisted(() => vi.fn());
const getFileContent = vi.hoisted(() => vi.fn());
const createFile = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/github/client', () => ({
  GitHubClient: class GitHubClient {
    getTree = getTree;
    getFileContent = getFileContent;
    createFile = createFile;
  },
}));

import { AuthProvider } from '../../../hooks/useAuth';
import { DocumentTree } from '../DocumentTree';

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
    'redraft.auth',
    JSON.stringify({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    }),
  );
}

function renderTree() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <DocumentTree />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('DocumentTree', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    window.location.hash = '#/d/media/overview.md';
    getTree.mockReset();
    getFileContent.mockReset().mockResolvedValue(null);
    createFile.mockReset();
  });

  it('shows under-review documents and keeps the documents tree collapsed by default', async () => {
    // Sidecar blob for media/overview.md is included in the tree response —
    // no per-file getFileContent probing required.
    getTree.mockResolvedValueOnce([
      { path: 'rest.md', type: 'blob' },
      { path: 'media/overview.md', type: 'blob' },
      { path: 'api/graphql.md', type: 'blob' },
      {
        path: '.redraft/comments/media/overview.comments.json',
        type: 'blob',
      },
    ]);

    renderTree();

    expect(await screen.findByText('Under Review')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /media\/overview\.md/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'rest.md' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));

    expect(await screen.findByText('api')).toBeInTheDocument();
    expect(screen.getByText('media')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'rest.md' })).toBeInTheDocument();
  });

  it('highlights the active document route', async () => {
    getTree.mockResolvedValueOnce([
      { path: 'media/overview.md', type: 'blob' },
    ]);

    renderTree();
    fireEvent.click(await screen.findByRole('button', { name: 'Documents' }));

    const activeLink = await screen.findByRole('link', { name: 'overview.md' });
    expect(activeLink).toHaveClass('bg-cyan-500/10');
  });

  it('navigates with a file link and exposes the target hash path', async () => {
    getTree.mockResolvedValueOnce([
      { path: 'media/overview.md', type: 'blob' },
    ]);

    renderTree();
    fireEvent.click(await screen.findByRole('button', { name: 'Documents' }));

    const link = await screen.findByRole('link', { name: 'overview.md' });
    expect(link).toHaveAttribute('href', '#/d/media/overview.md');
  });

  it('renders loading and error states', async () => {
    const { promise } = Promise.withResolvers<never>();
    getTree.mockReturnValueOnce(promise);
    renderTree();
    expect(await screen.findByText(/loading documents/i)).toBeInTheDocument();

    getTree.mockRejectedValueOnce(new Error('boom'));
    renderTree();
    expect(
      await screen.findByText(/unable to load documents/i),
    ).toBeInTheDocument();
  });

  it('creates a document from the dialog and calls createFile with a root-relative path', async () => {
    getTree.mockResolvedValueOnce([]);
    createFile.mockResolvedValueOnce({ sha: 'new-sha' });

    renderTree();

    fireEvent.click(
      await screen.findByRole('button', { name: /new document/i }),
    );
    fireEvent.change(screen.getByLabelText(/file path/i), {
      target: { value: 'api/new-document' },
    });
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'New Document' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create document/i }));

    await waitFor(() => {
      expect(createFile).toHaveBeenCalledWith(
        'api/new-document.md',
        '# New Document\n\n<!-- Write your document here -->',
        'Create document: new-document.md',
      );
    });
  });
});
