import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { positionThreads, resolveAnchor } from '../../lib/comments';
import type { CommentReply, CommentThread } from '../../types/comments';
import { CommentForm } from './CommentForm';
import { CommentThread as ThreadCard } from './CommentThread';
import { OrphanedComments } from './OrphanedComments';

interface PendingSelection {
  quote: string;
  context: {
    prefix: string;
    suffix: string;
  };
}

// Vertical gap enforced between stacked anchored cards.
const CARD_GAP = 12;
// Positioned layout only makes sense on the wide, side-by-side desktop view.
const POSITIONED_QUERY = '(min-width: 1024px)';

export function CommentsSidebar({
  comments,
  documentText,
  activeCommentId,
  onCommentClick,
  pendingSelection,
  onClearSelection,
  addComment,
  addReply,
  resolveThread,
  deleteThread,
  deleteReply,
  saveComments,
  isDirty,
  isSaving,
}: {
  comments: CommentThread[];
  documentText: string;
  activeCommentId: string | null;
  onCommentClick: (id: string) => void;
  pendingSelection: PendingSelection | null;
  onClearSelection: () => void;
  addComment: (
    thread: Omit<CommentThread, 'id' | 'createdAt' | 'replies'>,
  ) => void;
  addReply: (
    threadId: string,
    reply: Omit<CommentReply, 'id' | 'createdAt'>,
  ) => void;
  resolveThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  deleteReply: (threadId: string, replyId: string) => void;
  saveComments: () => Promise<void>;
  isDirty: boolean;
  isSaving: boolean;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const { ordered, orphaned } = useMemo(() => {
    const resolved = comments.map((thread) => ({
      thread,
      anchor: resolveAnchor(documentText, {
        quote: thread.quote,
        quoteContext: thread.quoteContext,
      }),
    }));

    const anchored = resolved
      .filter((entry) => entry.anchor.status !== 'orphaned')
      .sort((left, right) => left.anchor.startIndex - right.anchor.startIndex)
      .map((entry) => entry.thread);
    const orphanedThreads = resolved
      .filter((entry) => entry.anchor.status === 'orphaned')
      .map((entry) => entry.thread);

    return {
      ordered: anchored,
      orphaned: orphanedThreads,
    };
  }, [comments, documentText]);

  // --- Best-effort positional alignment (issue #8) ---------------------------
  // On desktop we float each anchored thread next to its document highlight,
  // pushing cards down only as far as needed to avoid overlap. On narrow
  // screens (and in non-DOM test environments) we fall back to normal flow.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = useState<Map<string, number>>(new Map());
  const [stackHeight, setStackHeight] = useState(0);
  const [positioned, setPositioned] = useState(false);

  const registerCard = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) {
        cardRefs.current.set(id, el);
      } else {
        cardRefs.current.delete(id);
      }
    },
    [],
  );

  // Track whether the positioned (desktop) layout is active.
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mq = window.matchMedia(POSITIONED_QUERY);
    const sync = () => setPositioned(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const orderedIds = useMemo(() => ordered.map((t) => t.id), [ordered]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const originTop = container.getBoundingClientRect().top;
    const inputs = orderedIds.map((id) => {
      let highlight: HTMLElement | null = null;
      try {
        const escaped =
          typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
        highlight = document.querySelector<HTMLElement>(
          `[data-comment-id="${escaped}"]`,
        );
      } catch {
        // A malformed selector (missing CSS.escape + exotic id) must never
        // crash the measurement pass — treat it as "no highlight found".
        highlight = null;
      }
      const card = cardRefs.current.get(id);
      const height = card?.offsetHeight ?? 0;
      const target = highlight
        ? Math.max(
            0,
            Math.round(highlight.getBoundingClientRect().top - originTop),
          )
        : 0;
      return { id, target, height };
    });

    const { placements, height } = positionThreads(inputs, { gap: CARD_GAP });

    setTops((prev) => {
      const next = new Map(placements.map((p) => [p.id, Math.round(p.top)]));
      if (
        prev.size === next.size &&
        [...next].every(([id, top]) => prev.get(id) === top)
      ) {
        return prev;
      }
      return next;
    });
    setStackHeight((prev) => {
      const rounded = Math.round(height);
      return prev === rounded ? prev : rounded;
    });
  }, [orderedIds]);

  useLayoutEffect(() => {
    if (!positioned) {
      return;
    }
    measure();

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      const main = document.querySelector('[data-testid="app-layout-main"]');
      if (main) {
        observer.observe(main);
      }
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [positioned, measure]);

  async function withToast(action: () => Promise<void>) {
    try {
      await action();
      return true;
    } catch (error) {
      showToast({
        tone: 'error',
        title:
          error instanceof Error ? error.message : 'Unable to save comments',
      });
      return false;
    }
  }

  return (
    <section className="space-y-4">
      {isDirty ? (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <span className="text-xs text-amber-300">
            Unsaved comment changes
          </span>
          <button
            type="button"
            disabled={isSaving}
            className="rounded px-2 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-500/40 transition hover:bg-amber-500/20 disabled:opacity-50"
            onClick={() => void withToast(saveComments)}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}

      {pendingSelection ? (
        <CommentForm
          quote={pendingSelection.quote}
          onCancel={onClearSelection}
          onSubmit={(body) => {
            addComment({
              quote: pendingSelection.quote,
              quoteContext: pendingSelection.context,
              author: {
                login: user?.login ?? '',
                avatarUrl: user?.avatarUrl ?? '',
              },
              body,
              resolved: false,
            });
            onClearSelection();
          }}
        />
      ) : null}

      <div
        ref={containerRef}
        className={positioned ? 'relative' : 'space-y-4'}
        style={positioned ? { height: stackHeight || undefined } : undefined}
        data-testid="comment-anchor-stack"
      >
        {ordered.map((thread) => {
          const card = (
            <ThreadCard
              thread={thread}
              active={activeCommentId === thread.id}
              onClick={() => onCommentClick(thread.id)}
              onReply={(body) => {
                addReply(thread.id, {
                  author: {
                    login: user?.login ?? '',
                    avatarUrl: user?.avatarUrl ?? '',
                  },
                  body,
                });
              }}
              onResolve={() => {
                resolveThread(thread.id);
              }}
              onDelete={() => deleteThread(thread.id)}
              onDeleteReply={(replyId) => deleteReply(thread.id, replyId)}
            />
          );

          if (!positioned) {
            return <div key={thread.id}>{card}</div>;
          }

          return (
            <div
              key={thread.id}
              ref={registerCard(thread.id)}
              className="absolute left-0 right-0 transition-[top] duration-200 ease-out"
              style={{
                top: tops.get(thread.id) ?? 0,
                zIndex: activeCommentId === thread.id ? 10 : 1,
              }}
              data-testid={`comment-anchor-${thread.id}`}
            >
              {card}
            </div>
          );
        })}
      </div>

      <OrphanedComments
        comments={orphaned}
        activeCommentId={activeCommentId}
        onCommentClick={onCommentClick}
        onReply={(threadId, body) => {
          addReply(threadId, {
            author: {
              login: user?.login ?? '',
              avatarUrl: user?.avatarUrl ?? '',
            },
            body,
          });
        }}
        onResolve={(threadId) => {
          resolveThread(threadId);
        }}
        onDelete={deleteThread}
        onDeleteReply={deleteReply}
      />
      {!pendingSelection && ordered.length === 0 && orphaned.length === 0 ? (
        <p className="text-sm text-slate-400">
          No comments yet. Select text in the document to add the first comment.
        </p>
      ) : null}
    </section>
  );
}
