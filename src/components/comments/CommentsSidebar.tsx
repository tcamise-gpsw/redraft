import { useMemo } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { useComments } from '../../hooks/useComments';
import { useToast } from '../../hooks/useToast';
import { resolveAnchor } from '../../lib/comments';
import type { CommentThread } from '../../types/comments';
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
  path,
  comments,
  documentText,
  activeCommentId,
  onCommentClick,
  pendingSelection,
  onClearSelection,
}: {
  path: string;
  comments: CommentThread[];
  documentText: string;
  activeCommentId: string | null;
  onCommentClick: (id: string) => void;
  pendingSelection: PendingSelection | null;
  onClearSelection: () => void;
}) {
  const { addComment, addReply, resolveThread } = useComments(path);
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
          error instanceof Error ? error.message : 'Unable to update comments',
      });
      return false;
    }
  }

  return (
    <section className="space-y-4">
      {pendingSelection ? (
        <CommentForm
          quote={pendingSelection.quote}
          onCancel={onClearSelection}
          onSubmit={async (body) => {
            const succeeded = await withToast(async () => {
              await addComment({
                quote: pendingSelection.quote,
                quoteContext: pendingSelection.context,
                author: {
                  login: user?.login ?? '',
                  avatarUrl: user?.avatarUrl ?? '',
                },
                body,
                resolved: false,
              });
            });
            if (succeeded) {
              onClearSelection();
            }
          }}
        />
      ) : null}

      {ordered.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          active={activeCommentId === thread.id}
          onClick={() => onCommentClick(thread.id)}
          onReply={async (body) => {
            await withToast(async () => {
              await addReply(thread.id, {
                author: {
                  login: user?.login ?? '',
                  avatarUrl: user?.avatarUrl ?? '',
                },
                body,
              });
            });
          }}
          onResolve={async () => {
            await withToast(async () => {
              await resolveThread(thread.id);
            });
          }}
        />
      ))}

      <OrphanedComments
        comments={orphaned}
        activeCommentId={activeCommentId}
        onCommentClick={onCommentClick}
        onReply={async (threadId, body) => {
          await withToast(async () => {
            await addReply(threadId, {
              author: {
                login: user?.login ?? '',
                avatarUrl: user?.avatarUrl ?? '',
              },
              body,
            });
          });
        }}
        onResolve={async (threadId) => {
          await withToast(async () => {
            await resolveThread(threadId);
          });
        }}
      />
    </section>
  );
}
