// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBranches = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const setBranch = vi.hoisted(() => vi.fn());
const isLocalMode = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({
  branch: 'dev',
  defaultBranch: 'main',
  pat: 'ghp_test',
  repo: { owner: 'acme', repo: 'workspace' },
}));

vi.mock('../../../lib/github/client', () => ({
  GitHubClient: class GitHubClient {
    listBranches = listBranches;
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    ...authState,
    setBranch,
  }),
}));

vi.mock('../../../lib/mode', () => ({
  getApiBaseUrl: () => 'https://api.github.com',
  isLocalMode,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

import { BranchSelector } from '../BranchSelector';

function renderBranchSelector() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BranchSelector />
    </QueryClientProvider>,
  );
}

function getRenderedBranchRow(name: string) {
  const matches = screen.getAllByText(name);
  const label = matches.at(-1);

  return label?.closest('button') ?? label?.parentElement ?? null;
}

describe('BranchSelector', () => {
  beforeEach(() => {
    authState.branch = 'dev';
    authState.defaultBranch = 'main';
    authState.pat = 'ghp_test';
    authState.repo = { owner: 'acme', repo: 'workspace' };
    listBranches
      .mockReset()
      .mockResolvedValue(['main', 'dev', 'Feature/API', 'release/2026.07']);
    navigate.mockReset();
    setBranch.mockReset();
    isLocalMode.mockReset().mockReturnValue(false);
  });

  it('renders the current branch name in the closed state', () => {
    renderBranchSelector();

    expect(screen.getByRole('button', { name: /dev/i })).toBeInTheDocument();
  });

  it('opens the dropdown and shows branches from GitHubClient.listBranches', async () => {
    renderBranchSelector();

    fireEvent.click(screen.getByRole('button', { name: /dev/i }));

    expect(
      await screen.findByPlaceholderText(/filter branches/i),
    ).toBeInTheDocument();
    expect(await screen.findByText('main')).toBeInTheDocument();
    expect(screen.getByText('Feature/API')).toBeInTheDocument();
    expect(listBranches).toHaveBeenCalledTimes(1);
  });

  it('filters the branch list case-insensitively', async () => {
    renderBranchSelector();

    fireEvent.click(screen.getByRole('button', { name: /dev/i }));
    fireEvent.change(await screen.findByPlaceholderText(/filter branches/i), {
      target: { value: 'feature' },
    });

    expect(screen.getByText('Feature/API')).toBeInTheDocument();
    expect(screen.queryByText('main')).toBeNull();
    expect(screen.queryByText('release/2026.07')).toBeNull();
  });

  it('badges the default branch and highlights the current branch item', async () => {
    renderBranchSelector();

    fireEvent.click(screen.getByRole('button', { name: /dev/i }));

    const defaultBranchRow = await waitFor(() => getRenderedBranchRow('main'));
    expect(defaultBranchRow).toHaveTextContent(/default/i);

    const currentBranchRow = await waitFor(() => getRenderedBranchRow('dev'));
    expect(currentBranchRow).toHaveClass('bg-indigo-600/20');
  });

  it('switches branches and navigates to the tree root', async () => {
    renderBranchSelector();

    fireEvent.click(screen.getByRole('button', { name: /dev/i }));
    fireEvent.click(await screen.findByText('release/2026.07'));

    expect(setBranch).toHaveBeenCalledWith('release/2026.07');
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('returns null in local mode', () => {
    isLocalMode.mockReturnValue(true);

    renderBranchSelector();

    expect(screen.queryByRole('button', { name: /dev/i })).toBeNull();
    expect(listBranches).not.toHaveBeenCalled();
  });

  it('shows a loading spinner while branches are loading', async () => {
    const { promise } = Promise.withResolvers<string[]>();
    listBranches.mockReturnValueOnce(promise);

    renderBranchSelector();
    fireEvent.click(screen.getByRole('button', { name: /dev/i }));

    expect(await screen.findByLabelText(/loading/i)).toBeInTheDocument();
  });

  it('shows an error state with a retry button when loading branches fails', async () => {
    listBranches
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(['main', 'dev']);

    renderBranchSelector();
    fireEvent.click(screen.getByRole('button', { name: /dev/i }));

    expect(
      await screen.findByText(/failed to load branches/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(listBranches).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('main')).toBeInTheDocument();
  });
});
