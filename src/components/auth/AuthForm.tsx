import { useState } from 'react';

import { useAuth, isInvalidAuthError } from '../../hooks/useAuth';
import { NetworkError } from '../../lib/github';

function splitRepository(value: string) {
  const [owner, repo, extra] = value.trim().split('/');

  if (!owner || !repo || extra) {
    return null;
  }

  return { owner, repo };
}

export function AuthForm() {
  const { login } = useAuth();
  const [pat, setPat] = useState('');
  const [repository, setRepository] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = splitRepository(repository);

    if (!parsed) {
      setError('Repository must use the owner/repo format.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(pat, parsed.owner, parsed.repo);
    } catch (submitError) {
      if (isInvalidAuthError(submitError)) {
        setError('Invalid token. Please check your PAT and try again.');
      } else if (submitError instanceof NetworkError) {
        setError('Unable to connect to GitHub. Check your network.');
      } else {
        setError('Unable to connect to GitHub. Check your network.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-50">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/30">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="ReDraft"
            className="h-10 rounded bg-white px-2 py-0.5"
          />
          <p className="text-sm text-slate-300">
            Enter a GitHub PAT and the target repository to unlock proposal
            review.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label
            className="block space-y-2 text-sm font-medium"
            htmlFor="github-pat"
          >
            <div className="flex items-baseline justify-between">
              <span>GitHub PAT</span>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=Proposal+Review+Workspace"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-normal text-cyan-400 hover:text-cyan-300"
              >
                Create a token →
              </a>
            </div>
            <input
              id="github-pat"
              name="pat"
              type="password"
              value={pat}
              onChange={(event) => setPat(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 outline-none ring-0 placeholder:text-slate-500"
              placeholder="ghp_..."
              autoComplete="off"
              required
            />
          </label>

          <label
            className="block space-y-2 text-sm font-medium"
            htmlFor="repository"
          >
            <span>Repository</span>
            <input
              id="repository"
              name="repository"
              type="text"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 outline-none ring-0 placeholder:text-slate-500"
              placeholder="owner/repo"
              autoComplete="off"
              required
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </main>
  );
}
