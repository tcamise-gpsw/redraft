// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';

const getTree = vi.hoisted(() => vi.fn());
const createFile = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/github/client', () => ({
  GitHubClient: class GitHubClient {
    getTree = getTree;
    createFile = createFile;
  },
}));

import { AuthProvider } from '../../../hooks/useAuth';
import { ProposalTree } from '../ProposalTree';

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
          <ProposalTree />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('ProposalTree', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    setStoredAuth();
    window.location.hash = '#/proposals/media/overview.md';
    getTree.mockReset();
    createFile.mockReset();
  });

  it('renders a sorted directory tree from proposal entries', async () => {
    getTree.mockResolvedValueOnce([
      { path: 'proposals/rest.md', type: 'blob' },
      { path: 'proposals/media/overview.md', type: 'blob' },
      { path: 'proposals/media', type: 'tree' },
      { path: 'proposals/api', type: 'tree' },
      { path: 'proposals/api/graphql.md', type: 'blob' },
    ]);

    renderTree();

    expect(await screen.findByText('api')).toBeInTheDocument();
    expect(screen.getByText('media')).toBeInTheDocument();
    expect(screen.getByText('rest.md')).toBeInTheDocument();

    const topLevelLabels = Array.from(screen.getByRole('tree').children).map(
      (item) => {
        const label = (item as HTMLElement).firstElementChild?.querySelector(
          '[data-testid="proposal-tree-label"]',
        );
        return label?.textContent ?? null;
      },
    );
    expect(topLevelLabels).toEqual(['api', 'media', 'rest.md']);
  });

  it('highlights the active proposal route', async () => {
    getTree.mockResolvedValueOnce([
      { path: 'proposals/media', type: 'tree' },
      { path: 'proposals/media/overview.md', type: 'blob' },
    ]);

    renderTree();

    const activeLink = await screen.findByRole('link', { name: 'overview.md' });
    expect(activeLink).toHaveClass('bg-cyan-500/10');
  });

  it('navigates with a file link and exposes the target hash path', async () => {
    getTree.mockResolvedValueOnce([
      { path: 'proposals/media', type: 'tree' },
      { path: 'proposals/media/overview.md', type: 'blob' },
    ]);

    renderTree();

    const link = await screen.findByRole('link', { name: 'overview.md' });
    expect(link).toHaveAttribute('href', '#/proposals/media/overview.md');
  });

  it('renders loading and error states', async () => {
    getTree.mockReturnValueOnce(new Promise(() => undefined));
    renderTree();
    expect(await screen.findByText(/loading proposals/i)).toBeInTheDocument();

    getTree.mockRejectedValueOnce(new Error('boom'));
    renderTree();
    expect(
      await screen.findByText(/unable to load proposals/i),
    ).toBeInTheDocument();
  });

  it('creates a proposal from the dialog and calls createFile', async () => {
    getTree.mockResolvedValueOnce([]);
    createFile.mockResolvedValueOnce({ sha: 'new-sha' });

    renderTree();

    fireEvent.click(
      await screen.findByRole('button', { name: /new proposal/i }),
    );
    fireEvent.change(screen.getByLabelText(/file path/i), {
      target: { value: 'api/new-proposal.md' },
    });
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'New Proposal' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create proposal/i }));

    await waitFor(() => {
      expect(createFile).toHaveBeenCalledWith(
        'proposals/api/new-proposal.md',
        '# New Proposal\n\n<!-- Write your proposal here -->',
        'Create proposal: new-proposal.md',
      );
    });
  });

  it('does not render .comments.json sidecar files in the tree', async () => {
    getTree.mockResolvedValueOnce([
      { path: 'proposals/api-design.md', type: 'blob' },
      { path: 'proposals/api-design.comments.json', type: 'blob' },
    ]);

    renderTree();

    expect(await screen.findByText('api-design.md')).toBeInTheDocument();
    expect(
      screen.queryByText('api-design.comments.json'),
    ).not.toBeInTheDocument();
  });
});
