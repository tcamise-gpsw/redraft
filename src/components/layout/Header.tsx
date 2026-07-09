import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { useShareableLink } from '../../hooks/useShareableLink';
import { isLocalMode } from '../../lib/mode';
import type { RateLimitInfo } from '../../types/github';
import { Avatar } from '../ui/Avatar';

export function Header({ rateLimit }: { rateLimit?: RateLimitInfo | null }) {
  const { user } = useAuth();
  const location = useLocation();
  const { copyLink } = useShareableLink();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const quotaLevel =
    rateLimit == null
      ? null
      : rateLimit.limit > 0
        ? rateLimit.remaining / rateLimit.limit
        : null;
  const quotaColor =
    quotaLevel === null
      ? 'bg-slate-500'
      : quotaLevel < 0.1
        ? 'bg-red-500'
        : quotaLevel < 0.25
          ? 'bg-amber-400'
          : 'bg-emerald-500';
  const quotaTextColor =
    quotaLevel === null
      ? 'text-slate-400'
      : quotaLevel < 0.1
        ? 'text-red-400'
        : quotaLevel < 0.25
          ? 'text-amber-300'
          : 'text-slate-300';

  const docPath = location.pathname.startsWith('/d/')
    ? location.pathname.slice('/d/'.length)
    : undefined;

  async function handleCopyLink(): Promise<void> {
    const copied = await copyLink(docPath);
    setCopyState(copied ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 2000);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          {user ? (
            <Avatar login={user.login} avatarUrl={user.avatarUrl} size="md" />
          ) : null}
          <div>
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="ReDraft"
              className="h-7 rounded bg-white px-1.5 py-0.5"
            />
            <p className="text-sm font-medium text-slate-100">
              @{user?.login ?? 'anonymous'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-300">
          {rateLimit != null && quotaLevel !== null && (
            <div
              className="flex flex-col items-end gap-0.5"
              title={`GitHub API quota: ${rateLimit.remaining.toLocaleString()} of ${rateLimit.limit.toLocaleString()} calls remaining. Resets at ${rateLimit.reset.toLocaleTimeString()}.`}
            >
              <span className={`text-xs tabular-nums ${quotaTextColor}`}>
                {rateLimit.remaining} / {rateLimit.limit}
              </span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${quotaColor}`}
                  style={{
                    width: `${Math.max(2, quotaLevel * 100).toFixed(1)}%`,
                  }}
                />
              </div>
            </div>
          )}
          {!isLocalMode() ? (
            <button
              type="button"
              className="rounded-md border border-slate-700 px-3 py-2 font-medium hover:border-slate-500"
              onClick={() => void handleCopyLink()}
            >
              {copyState === 'copied'
                ? 'Copied ✓'
                : copyState === 'failed'
                  ? 'Failed'
                  : 'Copy link'}
            </button>
          ) : null}
          <Link
            className="rounded-md border border-slate-700 px-3 py-2 font-medium hover:border-slate-500"
            to="/settings"
          >
            Settings
          </Link>
        </div>
      </div>
    </header>
  );
}
