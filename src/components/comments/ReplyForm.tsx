import { useState } from 'react';

import { Button } from '../ui/Button';

export function ReplyForm({
  onSubmit,
}: {
  onSubmit: (body: string) => Promise<void> | void;
}) {
  const [body, setBody] = useState('');

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim()) {
          return;
        }
        await onSubmit(body.trim());
        setBody('');
      }}
    >
      <label className="block space-y-2 text-sm font-medium" htmlFor="reply-body">
        <span>Reply</span>
        <textarea
          id="reply-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
        />
      </label>
      <Button type="submit" variant="secondary">
        Submit reply
      </Button>
    </form>
  );
}
