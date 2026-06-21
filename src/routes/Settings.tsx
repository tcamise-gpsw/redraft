import { useState } from 'react';

import { useAuth } from '../hooks/useAuth';

export function Settings() {
  const { user, repo, logout, updateRepo } = useAuth();
  const [repository, setRepository] = useState(
    repo ? `${repo.owner}/${repo.repo}` : '',
  );
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [owner, repoName, extra] = repository.trim().split('/');

    if (!owner || !repoName || extra) {
      setMessage('Repository must use the owner/repo format.');
      return;
    }

    updateRepo(owner, repoName);
    setMessage('Repository updated.');
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <div className="mx-auto max-w-2xl space-y-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-slate-300">
            Update the target repository or clear the stored GitHub PAT.
          </p>
        </header>

        <section className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          {user ? (
            <img
              src={user.avatarUrl}
              alt={`${user.login} avatar`}
              className="h-12 w-12 rounded-full border border-slate-700"
            />
          ) : null}
          <div>
            <p className="text-sm text-slate-400">Authenticated as</p>
            <p className="text-lg font-medium">@{user?.login ?? 'unknown'}</p>
          </div>
        </section>

        <form className="space-y-4" onSubmit={handleSave}>
          <label className="block space-y-2 text-sm font-medium" htmlFor="settings-repository">
            <span>Repository</span>
            <input
              id="settings-repository"
              type="text"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 outline-none ring-0 placeholder:text-slate-500"
              placeholder="owner/repo"
            />
          </label>

          {message ? <p className="text-sm text-slate-300">{message}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Save repository
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
