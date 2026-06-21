import { Link } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import type { RateLimitInfo } from '../../types/github';

export function Header({ rateLimit }: { rateLimit?: RateLimitInfo | null }) {
  const { user } = useAuth();
  const lowRateLimit =
    typeof rateLimit?.remaining === 'number' &&
    rateLimit.remaining > 0 &&
    rateLimit.remaining < 100;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          {user ? (
            <img
              src={user.avatarUrl}
              alt={`${user.login} avatar`}
              className="h-10 w-10 rounded-full border border-slate-700"
            />
          ) : null}
          <div>
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="ReDraft" className="h-7 rounded bg-white px-1.5 py-0.5" />
            <p className="text-sm font-medium text-slate-100">
              @{user?.login ?? 'anonymous'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span className={lowRateLimit ? 'text-amber-300' : ''}>
            API: {rateLimit?.remaining ?? 0}/{rateLimit?.limit ?? 0}
          </span>
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
