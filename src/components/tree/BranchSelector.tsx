import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { GitHubClient } from '../../lib/github/client';
import { getApiBaseUrl, isLocalMode } from '../../lib/mode';
import { Spinner } from '../ui/Spinner';

export function BranchSelector() {
  const { pat, repo, branch, defaultBranch, setBranch } = useAuth();
  const localMode = isLocalMode();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const client = useMemo(() => {
    if (!pat || !repo) {
      return null;
    }

    return new GitHubClient({
      pat,
      owner: repo.owner,
      repo: repo.repo,
      baseUrl: getApiBaseUrl(),
    });
  }, [pat, repo]);

  const branchesQuery = useQuery({
    queryKey: ['branches', repo?.owner, repo?.repo],
    queryFn: () => client!.listBranches(),
    enabled: Boolean(client) && !localMode,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (localMode || branch === null) {
    return null;
  }

  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const branches = branchesQuery.data ?? [];
  const visibleBranches = normalizedFilter
    ? branches.filter((name) =>
        name.toLocaleLowerCase().includes(normalizedFilter),
      )
    : branches;

  function handleSelect(nextBranch: string): void {
    setBranch(nextBranch);
    setOpen(false);
    setFilter('');
    navigate('/');
  }

  return (
    <div ref={rootRef} className="relative mb-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-left text-sm font-medium text-slate-100 hover:border-slate-500"
        onClick={() => setOpen((current) => !current)}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <path d="M6 9v3a6 6 0 0 0 6 6h3" />
          <path d="M6 9v12" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{branch}</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-lg">
          <input
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter branches…"
            className="mb-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
          />

          {branchesQuery.isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-slate-300">
              <Spinner />
              <span>Loading branches…</span>
            </div>
          ) : null}

          {branchesQuery.isError ? (
            <div className="px-2 py-3 text-sm text-rose-100">
              <p>Failed to load branches</p>
              <button
                type="button"
                className="mt-2 rounded-md border border-rose-400/40 px-2 py-1 text-xs font-medium hover:border-rose-300"
                onClick={() => void branchesQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}

          {!branchesQuery.isLoading && !branchesQuery.isError ? (
            <div className="max-h-64 overflow-y-auto">
              {visibleBranches.map((name) => {
                const current = name === branch;
                return (
                  <button
                    type="button"
                    key={name}
                    className={[
                      'flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-700',
                      current
                        ? 'bg-indigo-600/20 text-indigo-300'
                        : 'text-slate-100',
                    ].join(' ')}
                    onClick={() => handleSelect(name)}
                  >
                    <span className="min-w-0 truncate">{name}</span>
                    {name === defaultBranch ? (
                      <span className="shrink-0 text-xs text-slate-500">
                        default
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {visibleBranches.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-400">
                  No branches match
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
