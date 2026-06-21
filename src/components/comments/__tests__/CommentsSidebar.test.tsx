// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentThread } from '../../../types/comments';

const addComment = vi.hoisted(() => vi.fn());
const addReply = vi.hoisted(() => vi.fn());
const resolveThread = vi.hoisted(() => vi.fn());
const saveComments = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

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

// Shared default props for mutation callbacks
function mutationProps() {
  return {
    addComment,
    addReply,
    resolveThread,
    saveComments,
    isDirty: false,
    isSaving: false,
  };
}

describe('CommentsSidebar', () => {
  beforeEach(() => {
    addComment.mockReset();
    addReply.mockReset();
    resolveThread.mockReset();
    saveComments.mockReset().mockResolvedValue(undefined);
    showToast.mockReset();
  });

  it('orders resolved anchors before orphaned comments', () => {
    render(
      <CommentsSidebar
        {...mutationProps()}
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
    render(
      <CommentsSidebar
        {...mutationProps()}
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
        {...mutationProps()}
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

  it('shows the conflict toast when saveComments fails', async () => {
    saveComments.mockRejectedValueOnce(
      new Error(
        'File was modified since you loaded it. Please refresh and re-apply your changes.',
      ),
    );

    render(
      <CommentsSidebar
        {...mutationProps()}
        isDirty={true}
        comments={[]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
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
        {...mutationProps()}
        comments={[]}
        documentText="Any text."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });

  it('hides the empty-state message when a pending selection is active', () => {
    render(
      <CommentsSidebar
        {...mutationProps()}
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

  it('shows the save banner when isDirty and clears after successful save', async () => {
    render(
      <CommentsSidebar
        {...mutationProps()}
        isDirty={true}
        comments={[]}
        documentText="Any text."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    expect(screen.getByText(/unsaved comment changes/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    expect(saveComments).toHaveBeenCalled();
  });
});
