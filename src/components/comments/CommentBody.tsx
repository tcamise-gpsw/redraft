import type { Author } from '../../types/comments';

export function CommentBody({
  author,
  body,
  createdAt,
}: {
  author: Author;
  body: string;
  createdAt: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <img src={author.avatarUrl} alt={`${author.login} avatar`} className="h-8 w-8 rounded-full border border-slate-700" />
        <div>
          <p className="font-medium text-slate-100">@{author.login}</p>
          <p className="text-xs text-slate-400">{new Date(createdAt).toLocaleString()}</p>
        </div>
      </div>
      <p className="text-sm leading-6 text-slate-200">{body}</p>
    </div>
  );
}
