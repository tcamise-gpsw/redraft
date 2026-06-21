// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const useProposal = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useProposal', () => ({
  useProposal,
}));

vi.mock('../../tree/ProposalTree', () => ({
  ProposalTree: () => <div>tree</div>,
}));

vi.mock('../../document/DocumentView', () => ({
  DocumentView: ({ onSelectComment, onTextSelect }: { onSelectComment: (id: string) => void; onTextSelect: (selection: { quote: string; context: { prefix: string; suffix: string } }) => void }) => (
    <div>
      <button type="button" onClick={() => onSelectComment('thread-1')}>
        Trigger highlight
      </button>
      <button
        type="button"
        onClick={() =>
          onTextSelect({
            quote: 'initialize lazily',
            context: { prefix: 'The camera should ', suffix: ' when preview starts.' },
          })
        }
      >
        Trigger selection
      </button>
      <div data-comment-id="thread-1">highlight target</div>
    </div>
  ),
}));

vi.mock('../../comments/CommentsSidebar', () => ({
  CommentsSidebar: ({ pendingSelection, onCommentClick }: { pendingSelection: { quote: string } | null; onCommentClick: (id: string) => void }) => (
    <div>
      <button type="button" onClick={() => onCommentClick('thread-1')}>
        Trigger sidebar click
      </button>
      <div id="comment-thread-thread-1">thread target</div>
      {pendingSelection ? <div>pending: {pendingSelection.quote}</div> : null}
    </div>
  ),
}));

import { ProposalView } from '../../../routes/ProposalView';

describe('ProposalView comment interactions', () => {
  beforeEach(() => {
    useProposal.mockReturnValue({
      comments: { version: 1, comments: [] },
      content: 'The camera should initialize lazily when preview starts.',
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('scrolls the sidebar thread into view when a highlight is selected', () => {
    render(
      <MemoryRouter initialEntries={['/proposals/doc.md']}>
        <Routes>
          <Route path="/proposals/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger highlight/i }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('stores pending selection state so the sidebar can open the comment form', () => {
    render(
      <MemoryRouter initialEntries={['/proposals/doc.md']}>
        <Routes>
          <Route path="/proposals/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger selection/i }));

    expect(screen.getByText(/pending: initialize lazily/i)).toBeInTheDocument();
  });

  it('scrolls the highlighted document anchor into view when a comment is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/proposals/doc.md']}>
        <Routes>
          <Route path="/proposals/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger sidebar click/i }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
