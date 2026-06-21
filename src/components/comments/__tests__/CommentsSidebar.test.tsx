// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentThread } from '../../../types/comments';

const addComment = vi.hoisted(() => vi.fn());
const addReply = vi.hoisted(() => vi.fn());
const resolveThread = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useComments', () => ({
  useComments: () => ({
    addComment,
    addReply,
    resolveThread,
  }),
}));

vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    showToast,
  }),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    pat: 'ghp_test',
    repo: { owner: 'acme', repo: 'workspace' },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    updateRepo: vi.fn(),
  }),
}));

import { CommentsSidebar } from '../CommentsSidebar';
import { SelectionPopover } from '../SelectionPopover';

function makeThread(
  overrides: Partial<CommentThread> & Pick<CommentThread, 'id' | 'quote'>,
): CommentThread {
  return {
    id: overrides.id,
    quote: overrides.quote,
    quoteContext: overrides.quoteContext ?? { prefix: '', suffix: '' },
    author: overrides.author ?? {
      login: 'jdoe',
      avatarUrl: 'https://example.com/avatar.png',
    },
    body: overrides.body ?? 'Comment body',
    createdAt: overrides.createdAt ?? '2026-06-21T05:00:00Z',
    resolved: overrides.resolved ?? false,
    replies: overrides.replies ?? [],
  };
}

describe('CommentsSidebar', () => {
  beforeEach(() => {
    addComment.mockReset();
    addReply.mockReset();
    resolveThread.mockReset();
    showToast.mockReset();
  });

  it('orders resolved anchors before orphaned comments', () => {
    render(
      <CommentsSidebar
        path="proposals/doc.md"
        comments={[
          makeThread({ id: 'orphan', quote: 'missing quote' }),
          makeThread({ id: 'second', quote: 'preview starts' }),
          makeThread({ id: 'first', quote: 'initialize lazily' }),
        ]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    const headings = screen
      .getAllByTestId('comment-thread-quote')
      .map((node) => node.textContent);
    expect(headings).toEqual([
      'initialize lazily',
      'preview starts',
      'missing quote',
    ]);
    expect(screen.getByText(/orphaned comments/i)).toBeInTheDocument();
  });

  it('shows a comment form for pending text selections and submits a new comment', async () => {
    addComment.mockResolvedValueOnce(undefined);

    render(
      <CommentsSidebar
        path="proposals/doc.md"
        comments={[]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={{
          quote: 'initialize lazily',
          context: {
            prefix: 'The camera should ',
            suffix: ' when preview starts.',
          },
        }}
        onClearSelection={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/comment body/i), {
      target: { value: 'Question' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit comment/i }));
    });

    await waitFor(() => {
      expect(addComment).toHaveBeenCalledWith(
        expect.objectContaining({
          quote: 'initialize lazily',
          body: 'Question',
        }),
      );
    });
  });

  it('highlights the active thread and resolves it', () => {
    render(
      <CommentsSidebar
        path="proposals/doc.md"
        comments={[makeThread({ id: 'thread-1', quote: 'initialize lazily' })]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId="thread-1"
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    expect(screen.getByTestId('comment-thread-thread-1')).toHaveClass('ring-2');
    fireEvent.click(screen.getByRole('button', { name: /resolve thread/i }));
    expect(resolveThread).toHaveBeenCalledWith('thread-1');
  });

  it('shows the conflict toast when comment submission fails', async () => {
    addComment.mockRejectedValueOnce(
      new Error(
        'File was modified since you loaded it. Please refresh and re-apply your changes.',
      ),
    );

    render(
      <CommentsSidebar
        path="proposals/doc.md"
        comments={[]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={{
          quote: 'initialize lazily',
          context: {
            prefix: 'The camera should ',
            suffix: ' when preview starts.',
          },
        }}
        onClearSelection={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/comment body/i), {
      target: { value: 'Question' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit comment/i }));
    });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'error',
          title: expect.stringMatching(/refresh and re-apply/i),
        }),
      );
    });
  });

  it('shows an empty-state message when there are no comments and no pending selection', () => {
    render(
      <CommentsSidebar
        path="proposals/doc.md"
        comments={[]}
        documentText="Any text."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no comments yet/i),
    ).toBeInTheDocument();
  });

  it('hides the empty-state message when a pending selection is active', () => {
    render(
      <CommentsSidebar
        path="proposals/doc.md"
        comments={[]}
        documentText="Any text."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={{ quote: 'Any', context: { prefix: '', suffix: '' } }}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument();
  });
});

describe('SelectionPopover', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Reset any scrollY overrides
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  function makeSelection(quote: string, rectTop = 40, rootId = 'document-markdown-root') {
    return {
      toString: () => quote,
      rangeCount: 1,
      getRangeAt: () => ({
        commonAncestorContainer: document.getElementById(rootId)!.firstChild!,
        getBoundingClientRect: () => ({ left: 20, top: rectTop }),
      }),
    } as unknown as Selection;
  }

  it('shows a popover on mouseup when text is selected inside the root', () => {
    const onSelect = vi.fn();
    const quote = 'initialize lazily';

    render(
      <div>
        <div id="document-markdown-root">
          The camera should initialize lazily when preview starts.
        </div>
        <SelectionPopover
          rootSelector="#document-markdown-root"
          onSelect={onSelect}
        />
      </div>,
    );

    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection(quote));
    act(() => { document.dispatchEvent(new Event('mouseup')); });

    fireEvent.click(screen.getByRole('button', { name: /comment/i }));

    expect(onSelect).toHaveBeenCalledWith({
      quote,
      context: {
        prefix: 'The camera should ',
        suffix: ' when preview starts.',
      },
    });
  });

  it('shows a popover on keyup for keyboard-driven selections', () => {
    const quote = 'initialize lazily';
    render(
      <div>
        <div id="document-markdown-root">
          The camera should initialize lazily when preview starts.
        </div>
        <SelectionPopover rootSelector="#document-markdown-root" onSelect={vi.fn()} />
      </div>,
    );

    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection(quote));
    act(() => { document.dispatchEvent(new Event('keyup')); });

    expect(screen.getByRole('button', { name: /comment/i })).toBeInTheDocument();
  });

  it('does not show the popover during selection drag (no mouseup yet)', () => {
    render(
      <div>
        <div id="document-markdown-root">initialize lazily</div>
        <SelectionPopover rootSelector="#document-markdown-root" onSelect={vi.fn()} />
      </div>,
    );

    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection('initialize lazily'));
    // selectionchange fires during drag — must NOT show button
    act(() => { document.dispatchEvent(new Event('selectionchange')); });

    expect(screen.queryByRole('button', { name: /comment/i })).not.toBeInTheDocument();
  });

  it('positions the button using viewport coords only — no scroll offset', () => {
    render(
      <div>
        <div id="document-markdown-root">initialize lazily</div>
        <SelectionPopover rootSelector="#document-markdown-root" onSelect={vi.fn()} />
      </div>,
    );

    Object.defineProperty(window, 'scrollY', { value: 800, configurable: true });
    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection('initialize lazily', 400));
    act(() => { document.dispatchEvent(new Event('mouseup')); });

    const container = screen.getByRole('button', { name: /comment/i }).closest('[style]') as HTMLElement;
    const top = parseFloat(container.style.top ?? '0');
    // rect.top(400) - 40 = 360; with old bug: 400 + 800 - 40 = 1160
    expect(top).toBe(360);
  });

  it('clears the popover when the selection is emptied', () => {
    render(
      <div>
        <div id="document-markdown-root">initialize lazily</div>
        <SelectionPopover rootSelector="#document-markdown-root" onSelect={vi.fn()} />
      </div>,
    );

    // Appear on mouseup
    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection('initialize lazily'));
    act(() => { document.dispatchEvent(new Event('mouseup')); });
    expect(screen.getByRole('button', { name: /comment/i })).toBeInTheDocument();

    // Disappear when selection is cleared (user clicks away)
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '',
      rangeCount: 0,
      getRangeAt: () => null,
    } as unknown as Selection);
    act(() => { document.dispatchEvent(new Event('selectionchange')); });
    expect(screen.queryByRole('button', { name: /comment/i })).not.toBeInTheDocument();
  });

  it('clears a ghost popover when the selected text is not found in the root', () => {
    render(
      <div>
        <div id="document-markdown-root">initialize lazily</div>
        <SelectionPopover rootSelector="#document-markdown-root" onSelect={vi.fn()} />
      </div>,
    );

    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection('initialize lazily'));
    act(() => { document.dispatchEvent(new Event('mouseup')); });
    expect(screen.getByRole('button', { name: /comment/i })).toBeInTheDocument();

    vi.spyOn(window, 'getSelection').mockReturnValue(makeSelection('text not in root'));
    act(() => { document.dispatchEvent(new Event('mouseup')); });
    expect(screen.queryByRole('button', { name: /comment/i })).not.toBeInTheDocument();
  });
});
