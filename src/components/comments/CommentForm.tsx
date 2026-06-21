import { useState } from 'react';

import { Button } from '../ui/Button';

export function CommentForm({
  quote,
  onCancel,
  onSubmit,
}: {
  quote: string;
  onCancel: () => void;
  onSubmit: (body: string) => Promise<void> | void;
}) {
  const [body, setBody] = useState('');

  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim()) {
          return;
        }
        await onSubmit(body.trim());
        setBody('');
      }}
    >
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
        {quote}
      </div>
      <label
        className="block space-y-2 text-sm font-medium"
        htmlFor="comment-body"
      >
        <span>Comment body</span>
        <textarea
          id="comment-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit">Submit comment</Button>
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  );
}
