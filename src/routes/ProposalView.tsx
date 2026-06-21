import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CommentsSidebar } from '../components/comments/CommentsSidebar';
import { AppLayout } from '../components/layout/AppLayout';
import { DocumentView } from '../components/document/DocumentView';
import { ProposalTree } from '../components/tree/ProposalTree';
import { useProposal } from '../hooks/useProposal';

export function ProposalView() {
  const params = useParams();
  const path = useMemo(() => {
    const wildcard = params['*'];
    return wildcard ? `proposals/${wildcard}` : 'proposals/unknown.md';
  }, [params]);
  const { comments, content } = useProposal(path);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    quote: string;
    context: {
      prefix: string;
      suffix: string;
    };
  } | null>(null);

  return (
    <AppLayout
      sidebar={<ProposalTree />}
      main={
        <DocumentView
          path={path}
          onSelectComment={(id) => {
            setActiveCommentId(id);
            document
              .getElementById(`comment-thread-${id}`)
              ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
          onTextSelect={(selection) => {
            setPendingSelection(selection);
          }}
        />
      }
      aside={
        <CommentsSidebar
          path={path}
          comments={comments?.comments ?? []}
          documentText={content}
          activeCommentId={activeCommentId}
          onCommentClick={(id) => {
            setActiveCommentId(id);
            document
              .querySelector(`[data-comment-id="${id}"]`)
              ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }}
          pendingSelection={pendingSelection}
          onClearSelection={() => setPendingSelection(null)}
        />
      }
    />
  );
}
