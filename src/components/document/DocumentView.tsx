import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { CommentThread } from '../../types/comments';
import { useDocument } from '../../hooks/useDocument';
import { useDocumentEdit } from '../../hooks/useDocumentEdit';
import { ActivityIndicator } from './ActivityIndicator';
import { MilkdownDocument } from './MilkdownDocument';
import { Spinner } from '../ui/Spinner';

export function DocumentView({
  path,
  comments,
  onSelectComment,
  onTextSelect,
}: {
  path: string;
  comments: CommentThread[];
  onSelectComment: (id: string) => void;
  onTextSelect: (selection: {
    quote: string;
    context: { prefix: string; suffix: string };
  }) => void;
}) {
  const { save } = useDocumentEdit(path);
  const { content, commit, isLoading, error, sha } = useDocument(path);
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-slate-300">
        <Spinner />
        <span>Loading document…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">
        <h1 className="text-2xl font-semibold">Unable to load document</h1>
        <p className="mt-3 text-sm text-rose-200/90">{error.message}</p>
        <Link
          className="mt-4 inline-flex rounded-lg border border-rose-400/30 px-4 py-2 text-sm font-medium"
          to="/"
        >
          Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActivityIndicator commit={commit} />
      <MilkdownDocument
        comments={comments}
        content={content}
        isSaving={isSaving}
        onSave={async (nextContent) => {
          setIsSaving(true);
          try {
            await save(nextContent, sha);
          } finally {
            setIsSaving(false);
          }
        }}
        onSelectComment={onSelectComment}
        onTextSelect={onTextSelect}
      />
    </div>
  );
}
