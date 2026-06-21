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
}: {
  thread: CommentThreadType;
  active: boolean;
  onClick: () => void;
  onReply: (body: string) => Promise<void> | void;
  onResolve: () => Promise<void> | void;
}) {
  const [showReply, setShowReply] = useState(false);

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
        <div className="mb-3 text-sm font-medium text-cyan-100" data-testid="comment-thread-quote">
          {thread.quote}
        </div>
        <CommentBody author={thread.author} body={thread.body} createdAt={thread.createdAt} />
      </button>

      {thread.replies.length > 0 ? (
        <div className="space-y-3 border-l border-slate-800 pl-4">
          {thread.replies.map((reply) => (
            <CommentBody key={reply.id} author={reply.author} body={reply.body} createdAt={reply.createdAt} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void onResolve()} type="button" variant="secondary">
          {thread.resolved ? 'Re-open thread' : 'Resolve thread'}
        </Button>
        <Button onClick={() => setShowReply((value) => !value)} type="button" variant="secondary">
          Reply
        </Button>
      </div>

      {showReply ? <ReplyForm onSubmit={onReply} /> : null}
    </article>
  );
}
