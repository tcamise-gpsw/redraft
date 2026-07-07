// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFile = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const setBranch = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/github/client', () => ({
  GitHubClient: class GitHubClient {
    createFile = createFile;
  },
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    pat: 'ghp_test',
    repo: { owner: 'acme', repo: 'workspace' },
    branch: 'dev',
    defaultBranch: 'main',
    setBranch,
  }),
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

import { CreateDocumentDialog } from '../CreateDocumentDialog';

let queryClient: QueryClient;

function renderDialog(onClose = vi.fn()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateDocumentDialog open onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe('CreateDocumentDialog', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    createFile.mockReset().mockResolvedValue({ sha: 'new-sha' });
    navigate.mockReset();
    setBranch.mockReset();
  });

  it('creates the document on the active branch and invalidates the matching tree cache', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const onClose = vi.fn();

    renderDialog(onClose);

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
        'dev',
      );
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'tree', 'dev'],
    });
    expect(navigate).toHaveBeenCalledWith('/d/api/new-document.md');
    expect(onClose).toHaveBeenCalled();
  });
});
