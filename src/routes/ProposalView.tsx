import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CommentsSidebar } from '../components/comments/CommentsSidebar';
import { AppLayout } from '../components/layout/AppLayout';
import { DocumentView } from '../components/document/DocumentView';
import { ProposalTree } from '../components/tree/ProposalTree';
import { useComments } from '../hooks/useComments';
import { useDocument } from '../hooks/useDocument';

export function ProposalView() {
  const params = useParams();
  const path = useMemo(() => {
    const wildcard = params['*'];
    const cleaned = wildcard?.replace(/\/edit$/, '');
    return cleaned ? `proposals/${cleaned}` : 'proposals/unknown.md';
  }, [params]);

  const {
    threads,
    isDirty,
    isSaving,
    addComment,
    addReply,
    resolveThread,
    saveComments,
  } = useComments(path);

  const { content } = useDocument(path);

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
          comments={threads}
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
          comments={threads}
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
          addComment={addComment}
          addReply={addReply}
          resolveThread={resolveThread}
          saveComments={saveComments}
          isDirty={isDirty}
          isSaving={isSaving}
        />
      }
    />
  );
}
