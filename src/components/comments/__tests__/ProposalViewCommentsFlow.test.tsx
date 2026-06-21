// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { documentViewPath, useDocument, useComments } = vi.hoisted(() => ({
  documentViewPath: vi.fn(),
  useDocument: vi.fn(),
  useComments: vi.fn(),
}));

vi.mock('../../../hooks/useDocument', () => ({
  useDocument,
}));

vi.mock('../../../hooks/useComments', () => ({
  useComments,
}));

vi.mock('../../tree/DocumentTree', () => ({
  DocumentTree: () => <div>tree</div>,
}));

vi.mock('../../document/DocumentView', () => ({
  DocumentView: ({
    onSelectComment,
    onTextSelect,
    path,
  }: {
    path: string;
    comments: Array<{ id: string; quote: string }>;
    onSelectComment: (id: string) => void;
    onTextSelect: (selection: {
      quote: string;
      context: { prefix: string; suffix: string };
    }) => void;
  }) => (
    <div>
      {documentViewPath(path)}
      <button type="button" onClick={() => onSelectComment('thread-1')}>
        Trigger highlight
      </button>
      <button
        type="button"
        onClick={() =>
          onTextSelect({
            quote: 'initialize lazily',
            context: {
              prefix: 'The camera should ',
              suffix: ' when preview starts.',
            },
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
  CommentsSidebar: ({
    pendingSelection,
    onCommentClick,
  }: {
    pendingSelection: { quote: string } | null;
    onCommentClick: (id: string) => void;
  }) => (
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
    documentViewPath.mockReset();
    useDocument.mockReturnValue({
      content: 'The camera should initialize lazily when preview starts.',
      sha: '',
      commit: null,
      isLoading: false,
      error: null,
    });
    useComments.mockReturnValue({
      threads: [],
      isDirty: false,
      isSaving: false,
      isLoading: false,
      addComment: vi.fn(),
      addReply: vi.fn(),
      resolveThread: vi.fn(),
      saveComments: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('scrolls the sidebar thread into view when a highlight is selected', () => {
    render(
      <MemoryRouter initialEntries={['/d/doc.md']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger highlight/i }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('stores pending selection state so the sidebar can open the comment form', () => {
    render(
      <MemoryRouter initialEntries={['/d/doc.md']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger selection/i }));

    expect(screen.getByText(/pending: initialize lazily/i)).toBeInTheDocument();
  });

  it('scrolls the highlighted document anchor into view when a comment is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/d/doc.md']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /trigger sidebar click/i }),
    );

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('strips a trailing edit suffix before loading the document', () => {
    render(
      <MemoryRouter initialEntries={['/d/doc.md/edit']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(documentViewPath).toHaveBeenCalledWith('doc.md');
  });
});
