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

function makeMatchMedia(matches: boolean) {
  return (query: string): MediaQueryList =>
    ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }) as MediaQueryList;
}

function makeRect(top: number): DOMRect {
  return new DOMRect(0, top, 0, 0);
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

describe('CommentsSidebar positioned layout', () => {
  let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.stubGlobal('matchMedia', makeMatchMedia(true));
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: originalGetBoundingClientRect,
    });
    document
      .querySelectorAll('[data-comment-id]')
      .forEach((node) => node.remove());
    vi.unstubAllGlobals();
  });

  it('renders positioned wrappers for anchored threads on desktop', () => {
    render(
      <CommentsSidebar
        {...mutationProps()}
        comments={[
          makeThread({ id: 'first', quote: 'initialize lazily' }),
          makeThread({ id: 'second', quote: 'preview starts' }),
        ]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    const stack = screen.getByTestId('comment-anchor-stack');
    expect(stack).toHaveClass('relative');

    for (const id of ['first', 'second']) {
      const anchor = screen.getByTestId(`comment-anchor-${id}`);
      expect(anchor).toHaveClass('absolute');
      expect(anchor.style.top).toMatch(/^\d+px$/);
    }
  });

  it('aligns anchored threads to highlight positions without overlap', async () => {
    const highlightTops = new Map([
      ['first', 100],
      ['second', 120],
    ]);

    for (const id of highlightTops.keys()) {
      const highlight = document.createElement('span');
      highlight.setAttribute('data-comment-id', id);
      document.body.appendChild(highlight);
    }

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function getBoundingClientRect(this: HTMLElement): DOMRect {
        const commentId = this.getAttribute('data-comment-id');
        if (commentId) {
          return makeRect(highlightTops.get(commentId) ?? 0);
        }
        if (this.getAttribute('data-testid') === 'comment-anchor-stack') {
          return makeRect(0);
        }
        return makeRect(0);
      },
    });

    render(
      <CommentsSidebar
        {...mutationProps()}
        comments={[
          makeThread({ id: 'first', quote: 'initialize lazily' }),
          makeThread({ id: 'second', quote: 'preview starts' }),
        ]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    const firstAnchor = screen.getByTestId('comment-anchor-first');
    const secondAnchor = screen.getByTestId('comment-anchor-second');

    for (const anchor of [firstAnchor, secondAnchor]) {
      Object.defineProperty(anchor, 'offsetHeight', {
        configurable: true,
        get: () => 80,
      });
    }

    await act(async () => {
      fireEvent(window, new Event('resize'));
    });

    await waitFor(() => {
      expect(firstAnchor.style.top).toBe('100px');
      expect(secondAnchor.style.top).toBe('192px');
    });

    const firstTop = Number.parseFloat(firstAnchor.style.top);
    const secondTop = Number.parseFloat(secondAnchor.style.top);
    expect(secondTop).toBeGreaterThan(firstTop);
    expect(secondTop - firstTop).toBe(92);
  });

  it('falls back to flow layout when desktop positioning is unavailable', () => {
    vi.unstubAllGlobals();

    render(
      <CommentsSidebar
        {...mutationProps()}
        comments={[
          makeThread({ id: 'first', quote: 'initialize lazily' }),
          makeThread({ id: 'second', quote: 'preview starts' }),
        ]}
        documentText="The camera should initialize lazily when preview starts."
        activeCommentId={null}
        onCommentClick={vi.fn()}
        pendingSelection={null}
        onClearSelection={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId('comment-anchor-first'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('comment-anchor-second'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('comment-anchor-stack')).toHaveClass('space-y-4');
    expect(
      screen
        .getAllByTestId('comment-thread-quote')
        .map((node) => node.textContent),
    ).toEqual(['initialize lazily', 'preview starts']);
  });
});
