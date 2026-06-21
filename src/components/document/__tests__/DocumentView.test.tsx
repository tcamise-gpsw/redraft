// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveProposal, useProposal, useProposalEdit } = vi.hoisted(() => ({
  saveProposal: vi.fn(),
  useProposal: vi.fn(),
  useProposalEdit: vi.fn(),
}));

vi.mock('../../../hooks/useProposal', () => ({
  useProposal,
}));

vi.mock('../../../hooks/useProposalEdit', () => ({
  useProposalEdit,
}));

vi.mock('../ActivityIndicator', () => ({
  ActivityIndicator: ({ commit }: { commit: { sha: string } | null }) => (
    <div>commit:{commit?.sha ?? 'none'}</div>
  ),
}));

vi.mock('../milkdown/CrepeEditor', () => ({
  CrepeEditor: () => <div>crepe-editor</div>,
}));

vi.mock('../MilkdownDocument', () => ({
  MilkdownDocument: ({
    content,
    comments,
    isSaving,
    onSave,
  }: {
    content: string;
    comments: Array<{ id: string; quote: string }>;
    isSaving?: boolean;
    onSave: (markdown: string) => Promise<void>;
  }) => (
    <div>
      <div>content:{content}</div>
      <div>comments:{comments.length}</div>
      <div>saving:{String(Boolean(isSaving))}</div>
      <button onClick={() => void onSave('# Updated')} type="button">
        Save from document
      </button>
    </div>
  ),
}));

import { DocumentView } from '../DocumentView';

describe('DocumentView', () => {
  beforeEach(() => {
    saveProposal.mockReset().mockResolvedValue(undefined);
    useProposalEdit.mockReset().mockReturnValue({ save: saveProposal });
    useProposal.mockReset().mockReturnValue({
      content: '# Proposal',
      sha: 'current-sha',
      comments: {
        comments: [{ id: 'comment-1', quote: 'Proposal' }],
      },
      commit: { sha: 'abc123' },
      isLoading: false,
      error: null,
    });
  });

  it('renders MilkdownDocument with proposal content and comments', () => {
    render(
      <MemoryRouter>
        <DocumentView
          path="proposals/doc.md"
          onSelectComment={vi.fn()}
          onTextSelect={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('content:# Proposal')).toBeInTheDocument();
    expect(screen.getByText('comments:1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
  });

  it('saves through useProposalEdit with the current sha', async () => {
    render(
      <MemoryRouter>
        <DocumentView
          path="proposals/doc.md"
          onSelectComment={vi.fn()}
          onTextSelect={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save from document' }));

    await waitFor(() => {
      expect(saveProposal).toHaveBeenCalledWith('# Updated', 'current-sha');
    });
  });

  it('shows the loading state while the proposal query is pending', () => {
    useProposal.mockReturnValueOnce({
      content: '',
      sha: '',
      comments: null,
      commit: null,
      isLoading: true,
      error: null,
    });

    render(
      <MemoryRouter>
        <DocumentView
          path="proposals/doc.md"
          onSelectComment={vi.fn()}
          onTextSelect={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading proposal…')).toBeInTheDocument();
  });

  it('shows the error state when loading fails', () => {
    useProposal.mockReturnValueOnce({
      content: '',
      sha: '',
      comments: null,
      commit: null,
      isLoading: false,
      error: new Error('Boom'),
    });

    render(
      <MemoryRouter>
        <DocumentView
          path="proposals/doc.md"
          onSelectComment={vi.fn()}
          onTextSelect={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Unable to load proposal')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });
});
