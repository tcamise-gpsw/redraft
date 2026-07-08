// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const {
  commentsSidebarProps,
  documentViewPath,
  documentViewProps,
  useDocument,
  useComments,
  useDocuments,
} = vi.hoisted(() => ({
  commentsSidebarProps: vi.fn(),
  documentViewPath: vi.fn(),
  documentViewProps: vi.fn(),
  useDocument: vi.fn(),
  useComments: vi.fn(),
  useDocuments: vi.fn(),
}));

vi.mock('../../../hooks/useDocument', () => ({
  useDocument,
}));

vi.mock('../../../hooks/useComments', () => ({
  useComments,
}));

vi.mock('../../../hooks/useDocuments', () => ({
  useDocuments,
}));

vi.mock('../../tree/DocumentTree', () => ({
  DocumentTree: () => <div>tree</div>,
}));

vi.mock('../../document/DocumentView', () => ({
  DocumentView: ({
    comments,
    onRenderedText,
    onSelectComment,
    onTextSelect,
    path,
  }: {
    path: string;
    comments: Array<{ id: string; quote: string }>;
    onRenderedText?: (text: string) => void;
    onSelectComment: (id: string) => void;
    onTextSelect: (selection: {
      quote: string;
      context: { prefix: string; suffix: string };
      offset: number;
    }) => void;
  }) => {
    documentViewProps({
      comments,
      onRenderedText,
      onSelectComment,
      onTextSelect,
      path,
    });

    return (
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
              offset: 18,
            })
          }
        >
          Trigger selection
        </button>
        <button
          type="button"
          onClick={() =>
            onRenderedText?.(
              'The camera should initialize lazily when preview starts.',
            )
          }
        >
          Trigger rendered text
        </button>
        <div data-comment-id="thread-1">highlight target</div>
      </div>
    );
  },
}));

vi.mock('../../comments/CommentsSidebar', () => ({
  CommentsSidebar: ({
    documentText,
    pendingSelection,
    onCommentClick,
  }: {
    documentText: string;
    pendingSelection: { quote: string; offset: number } | null;
    onCommentClick: (id: string) => void;
  }) => {
    commentsSidebarProps({ documentText, pendingSelection, onCommentClick });

    return (
      <div>
        <button type="button" onClick={() => onCommentClick('thread-1')}>
          Trigger sidebar click
        </button>
        <div id="comment-thread-thread-1">thread target</div>
        <div data-testid="sidebar-document-text">document: {documentText}</div>
        {pendingSelection ? (
          <div>
            pending: {pendingSelection.quote} @ {pendingSelection.offset}
          </div>
        ) : null}
      </div>
    );
  },
}));

import { ProposalView } from '../../../routes/ProposalView';

describe('ProposalView comment interactions', () => {
  beforeEach(() => {
    commentsSidebarProps.mockReset();
    documentViewPath.mockReset();
    documentViewProps.mockReset();
    useDocument.mockReturnValue({
      content:
        '# Camera setup\n\n**The** camera should initialize lazily when preview starts.',
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
    useDocuments.mockReturnValue({ sidecarBranchExists: true });
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

  it('stores pending selection state, including offset, so the sidebar can open the comment form', () => {
    render(
      <MemoryRouter initialEntries={['/d/doc.md']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger selection/i }));

    expect(
      screen.getByText(/pending: initialize lazily @ 18/i),
    ).toBeInTheDocument();
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

  it('passes rendered editor text from DocumentView into the sidebar and resets to new raw content on document changes', () => {
    let currentContent =
      '# Camera setup\n\n**The** camera should initialize lazily when preview starts.';
    useDocument.mockImplementation(() => ({
      content: currentContent,
      sha: '',
      commit: null,
      isLoading: false,
      error: null,
    }));

    const view = render(
      <MemoryRouter initialEntries={['/d/doc.md']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(documentViewProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onRenderedText: expect.any(Function),
      }),
    );
    expect(commentsSidebarProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ documentText: currentContent }),
    );

    act(() => {
      documentViewProps.mock.lastCall?.[0].onRenderedText(
        'The camera should initialize lazily when preview starts.',
      );
    });

    expect(screen.getByTestId('sidebar-document-text')).toHaveTextContent(
      'document: The camera should initialize lazily when preview starts.',
    );

    currentContent = '# Updated\n\nA different document.';
    view.rerender(
      <MemoryRouter initialEntries={['/d/doc.md']}>
        <Routes>
          <Route path="/d/*" element={<ProposalView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(commentsSidebarProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ documentText: currentContent }),
    );
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
