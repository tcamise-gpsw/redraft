import { useMemo } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { resolveAnchor } from '../../lib/comments';
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

      {ordered.map((thread) => (
        <ThreadCard
          key={thread.id}
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
        />
      ))}

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
      />
      {!pendingSelection && ordered.length === 0 && orphaned.length === 0 ? (
        <p className="text-sm text-slate-400">
          No comments yet. Select text in the document to add the first comment.
        </p>
      ) : null}
    </section>
  );
}
