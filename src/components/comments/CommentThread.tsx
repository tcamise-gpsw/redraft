import { useState } from 'react';

import type { CommentThread as CommentThreadType } from '../../types/comments';
import { CommentBody } from './CommentBody';
import { ReplyForm } from './ReplyForm';
import { Button } from '../ui/Button';

export function CommentThread({
  thread,
  active,
  onClick,
  onReply,
  onResolve,
  onDelete,
  onDeleteReply,
}: {
  thread: CommentThreadType;
  active: boolean;
  onClick: () => void;
  onReply: (body: string) => Promise<void> | void;
  onResolve: () => Promise<void> | void;
  onDelete: () => void;
  onDeleteReply: (replyId: string) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingReplyId, setConfirmingReplyId] = useState<string | null>(
    null,
  );

  return (
    <article
      className={[
        'space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition',
        active ? 'ring-2 ring-cyan-400/70' : '',
        thread.resolved ? 'opacity-70' : '',
      ].join(' ')}
      data-testid={`comment-thread-${thread.id}`}
      id={`comment-thread-${thread.id}`}
    >
      <button type="button" onClick={onClick} className="w-full text-left">
        <div
          className="mb-3 text-sm font-medium text-cyan-100"
          data-testid="comment-thread-quote"
        >
          {thread.quote}
        </div>
        <CommentBody
          author={thread.author}
          body={thread.body}
          createdAt={thread.createdAt}
        />
      </button>

      {thread.replies.length > 0 ? (
        <div className="space-y-3 border-l border-slate-800 pl-4">
          {thread.replies.map((reply) => (
            <div
              key={reply.id}
              data-testid={`comment-reply-${reply.id}`}
              className="space-y-2"
            >
              <CommentBody
                author={reply.author}
                body={reply.body}
                createdAt={reply.createdAt}
              />
              <div className="flex flex-wrap gap-2">
                {confirmingReplyId === reply.id ? (
                  <>
                    <Button
                      onClick={() => {
                        onDeleteReply(reply.id);
                        setConfirmingReplyId(null);
                      }}
                      type="button"
                      variant="secondary"
                      className="border-rose-500/50 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/20"
                    >
                      Confirm
                    </Button>
                    <Button
                      onClick={() => setConfirmingReplyId(null)}
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setConfirmingReplyId(reply.id)}
                    type="button"
                    variant="secondary"
                    className="px-2 py-1 text-xs text-rose-300 hover:border-rose-400/60 hover:text-rose-200"
                  >
                    Delete reply
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => void onResolve()}
          type="button"
          variant="secondary"
        >
          {thread.resolved ? 'Re-open thread' : 'Resolve thread'}
        </Button>
        <Button
          onClick={() => setShowReply((value) => !value)}
          type="button"
          variant="secondary"
        >
          Reply
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              onClick={onDelete}
              type="button"
              variant="secondary"
              className="border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
            >
              Confirm delete
            </Button>
            <Button
              onClick={() => setConfirmingDelete(false)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            onClick={() => setConfirmingDelete(true)}
            type="button"
            variant="secondary"
            className="text-rose-300 hover:text-rose-200 hover:border-rose-400/60"
          >
            Delete thread
          </Button>
        )}
      </div>

      {showReply ? <ReplyForm onSubmit={onReply} /> : null}
    </article>
  );
}
