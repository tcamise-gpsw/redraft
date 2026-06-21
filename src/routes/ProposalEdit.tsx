import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { MarkdownEditor } from '../components/document/MarkdownEditor';
import { Spinner } from '../components/ui/Spinner';
import { AppLayout } from '../components/layout/AppLayout';
import { ProposalTree } from '../components/tree/ProposalTree';
import { useProposal } from '../hooks/useProposal';
import { useProposalEdit } from '../hooks/useProposalEdit';

export function ProposalEdit() {
  const params = useParams();
  const path = useMemo(() => {
    const wildcard = params['*'];
    const cleaned = wildcard?.replace(/\/edit$/, '');
    return cleaned ? `proposals/${cleaned}` : 'proposals/unknown.md';
  }, [params]);
  const navigate = useNavigate();
  const { content, sha, isLoading, error } = useProposal(path);
  const { save } = useProposalEdit(path);
  const [isSaving, setIsSaving] = useState(false);

  return (
    <AppLayout
      sidebar={<ProposalTree />}
      main={
        isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-3 text-slate-300">
            <Spinner />
            <span>Loading proposal…</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">
            <h1 className="text-2xl font-semibold">Unable to load proposal</h1>
            <p className="mt-3 text-sm text-rose-200/90">{error.message}</p>
          </div>
        ) : (
          <MarkdownEditor
            initialContent={content}
            isSaving={isSaving}
            onCancel={() =>
              navigate(`/${path.replace(/^proposals\//, 'proposals/')}`)
            }
            onSave={async (nextContent) => {
              setIsSaving(true);
              try {
                await save(nextContent, sha);
              } finally {
                setIsSaving(false);
              }
            }}
          />
        )
      }
      aside={
        <div className="text-sm text-slate-300">
          Comments sidebar disabled while editing.
        </div>
      }
    />
  );
}
