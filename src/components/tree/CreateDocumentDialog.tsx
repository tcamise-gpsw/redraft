import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { useAuth } from '../../hooks/useAuth';
import { GitHubClient } from '../../lib/github';
import { getApiBaseUrl } from '../../lib/mode';

export function CreateDocumentDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { pat, repo, branch } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [path, setPath] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedPath = path.trim().replace(/^\/+/, '');
    if (!normalizedPath) {
      setError('File path is required.');
      return;
    }

    if (!pat || !repo) {
      setError('Authentication is required.');
      return;
    }

    if (branch === null) {
      setError('Branch is still loading. Please wait and try again.');
      return;
    }

    const fullPath = normalizedPath.endsWith('.md')
      ? normalizedPath
      : `${normalizedPath}.md`;
    const filename = fullPath.split('/').at(-1) ?? fullPath;
    const documentTitle = title.trim() || filename.replace(/\.md$/u, '');

    setError(null);
    setSubmitting(true);

    try {
      const client = new GitHubClient({
        pat,
        owner: repo.owner,
        repo: repo.repo,
        baseUrl: getApiBaseUrl(),
      });
      await client.createFile(
        fullPath,
        `# ${documentTitle}\n\n<!-- Write your document here -->`,
        `Create document: ${filename}`,
        branch ?? undefined,
      );
      await queryClient.invalidateQueries({
        queryKey: ['documents', 'tree', branch],
      });
      navigate(`/d/${fullPath}`);
      setPath('');
      setTitle('');
      onClose();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create document',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} title="New document" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleCreate}>
        <label
          className="block space-y-2 text-sm font-medium"
          htmlFor="document-path"
        >
          <span>File path</span>
          <input
            id="document-path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="docs/new-document"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
          />
        </label>
        <label
          className="block space-y-2 text-sm font-medium"
          htmlFor="document-title"
        >
          <span>Title</span>
          <input
            id="document-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="New Document"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
          />
        </label>
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button disabled={submitting} type="submit">
            {submitting ? 'Creating…' : 'Create document'}
          </Button>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
