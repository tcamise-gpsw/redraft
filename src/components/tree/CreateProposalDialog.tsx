import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { GitHubClient } from '../../lib/github';

export function CreateProposalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pat, repo } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [path, setPath] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!path.trim().endsWith('.md')) {
      setError('File path must end with .md');
      return;
    }

    if (!pat || !repo) {
      setError('Authentication is required.');
      return;
    }

    const normalizedPath = path.trim().replace(/^\/+/, '');
    const fullPath = `proposals/${normalizedPath}`;
    const filename = normalizedPath.split('/').at(-1) ?? normalizedPath;

    setError(null);
    setSubmitting(true);

    try {
      const client = new GitHubClient({ pat, owner: repo.owner, repo: repo.repo });
      await client.createFile(
        fullPath,
        `# ${title.trim()}\n\n<!-- Write your proposal here -->`,
        `Create proposal: ${filename}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['proposals', 'tree'] });
      navigate(`/proposals/${normalizedPath}`);
      setPath('');
      setTitle('');
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create proposal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} title="New proposal" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleCreate}>
        <label className="block space-y-2 text-sm font-medium" htmlFor="proposal-path">
          <span>File path</span>
          <input
            id="proposal-path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="api/new-proposal.md"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium" htmlFor="proposal-title">
          <span>Title</span>
          <input
            id="proposal-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="New Proposal"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
          />
        </label>
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button disabled={submitting} type="submit">
            {submitting ? 'Creating…' : 'Create proposal'}
          </Button>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
