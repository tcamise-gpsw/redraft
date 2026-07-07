import type { CommentThread } from '../../types/comments';
import { CommentThread as ThreadCard } from './CommentThread';

export function OrphanedComments({
  comments,
  activeCommentId,
  onCommentClick,
  onReply,
  onResolve,
  onDelete,
  onDeleteReply,
}: {
  comments: CommentThread[];
  activeCommentId: string | null;
  onCommentClick: (id: string) => void;
  onReply: (threadId: string, body: string) => Promise<void> | void;
  onResolve: (threadId: string) => Promise<void> | void;
  onDelete: (threadId: string) => void;
  onDeleteReply: (threadId: string, replyId: string) => void;
}) {
  if (comments.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100">
        ⚠️ Orphaned comments
      </div>
      {comments.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          active={activeCommentId === thread.id}
          onClick={() => onCommentClick(thread.id)}
          onReply={(body) => onReply(thread.id, body)}
          onResolve={() => onResolve(thread.id)}
          onDelete={() => onDelete(thread.id)}
          onDeleteReply={(replyId) => onDeleteReply(thread.id, replyId)}
        />
      ))}
    </section>
  );
}
