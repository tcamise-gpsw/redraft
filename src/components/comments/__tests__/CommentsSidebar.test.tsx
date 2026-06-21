// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { CommentsSidebar } from '../CommentsSidebar';
import { SelectionPopover } from '../SelectionPopover';

function makeThread(overrides: Partial<CommentThread> & Pick<CommentThread, 'id' | 'quote'>): CommentThread {
  return {
    id: overrides.id,
    quote: overrides.quote,
    quoteContext: overrides.quoteContext ?? { prefix: '', suffix: '' },
    author: overrides.author ?? { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
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

    const headings = screen.getAllByTestId('comment-thread-quote').map((node) => node.textContent);
    expect(headings).toEqual(['initialize lazily', 'preview starts', 'missing quote']);
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
          context: { prefix: 'The camera should ', suffix: ' when preview starts.' },
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
      new Error('File was modified since you loaded it. Please refresh and re-apply your changes.'),
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
          context: { prefix: 'The camera should ', suffix: ' when preview starts.' },
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
});

describe('SelectionPopover', () => {
  it('shows a popover for selections inside the markdown root', async () => {
    const onSelect = vi.fn();
    const quote = 'initialize lazily';

    render(
      <div>
        <div id="document-markdown-root">The camera should initialize lazily when preview starts.</div>
        <SelectionPopover rootSelector="#document-markdown-root" onSelect={onSelect} />
      </div>,
    );

    const selection = {
      toString: () => quote,
      rangeCount: 1,
      getRangeAt: () => ({
        commonAncestorContainer: document.getElementById('document-markdown-root')!.firstChild!,
        getBoundingClientRect: () => ({ left: 20, top: 40 }),
      }),
    };

    vi.spyOn(window, 'getSelection').mockReturnValue(selection as unknown as Selection);
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    fireEvent.click(await screen.findByRole('button', { name: /comment/i }));

    expect(onSelect).toHaveBeenCalledWith({
      quote,
      context: {
        prefix: 'The camera should ',
        suffix: ' when preview starts.',
      },
    });
  });
});
