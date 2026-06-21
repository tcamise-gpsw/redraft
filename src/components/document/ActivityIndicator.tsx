import type { CommitInfo } from '../../types/github';

function formatRelativeTime(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function ActivityIndicator({ commit }: { commit: CommitInfo | null }) {
  if (!commit) {
    return null;
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-300">
      <img
        src={commit.author.avatarUrl}
        alt={`${commit.author.login} avatar`}
        className="h-9 w-9 rounded-full border border-slate-700"
      />
      <div>
        <p>
          Last edited by{' '}
          <span className="font-medium text-slate-100">
            @{commit.author.login}
          </span>{' '}
          · {formatRelativeTime(commit.date)}
        </p>
        <p className="text-xs text-slate-400">{commit.message}</p>
      </div>
    </div>
  );
}
