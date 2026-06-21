import { Link } from 'react-router-dom';

import { useProposal } from '../../hooks/useProposal';
import { ActivityIndicator } from './ActivityIndicator';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Spinner } from '../ui/Spinner';
import { SelectionPopover } from '../comments/SelectionPopover';

export function DocumentView({
  path,
  onSelectComment,
  onTextSelect,
}: {
  path: string;
  onSelectComment: (id: string) => void;
  onTextSelect: (selection: { quote: string; context: { prefix: string; suffix: string } }) => void;
}) {
  const { content, comments, commit, isLoading, error } = useProposal(path);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-slate-300">
        <Spinner />
        <span>Loading proposal…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">
        <h1 className="text-2xl font-semibold">Unable to load proposal</h1>
        <p className="mt-3 text-sm text-rose-200/90">{error.message}</p>
        <Link className="mt-4 inline-flex rounded-lg border border-rose-400/30 px-4 py-2 text-sm font-medium" to="/">
          Back to tree
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100" to={`/proposals/${path.replace(/^proposals\//, '')}/edit`}>
          Edit
        </Link>
      </div>
      <ActivityIndicator commit={commit} />
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6" id="document-markdown-root">
        <MarkdownRenderer
          content={content}
          comments={comments?.comments ?? []}
          onSelectComment={onSelectComment}
          onTextSelect={onTextSelect}
        />
      </div>
      <SelectionPopover rootSelector="#document-markdown-root" onSelect={onTextSelect} />
    </div>
  );
}
