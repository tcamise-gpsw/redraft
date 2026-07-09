import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CommentsSidebar } from '../components/comments/CommentsSidebar';
import { AppLayout } from '../components/layout/AppLayout';
import { DocumentView } from '../components/document/DocumentView';
import { DocumentTree } from '../components/tree/DocumentTree';
import { useComments } from '../hooks/useComments';
import { useDocument } from '../hooks/useDocument';
import { useDocuments } from '../hooks/useDocuments';

export function ProposalView() {
  const params = useParams();
  const path = useMemo(() => {
    const wildcard = params['*'];
    const cleaned = wildcard?.replace(/\/edit$/, '');
    return cleaned || 'unknown.md';
  }, [params]);

  const {
    threads,
    isDirty,
    isSaving,
    addComment,
    addReply,
    resolveThread,
    deleteThread,
    deleteReply,
    saveComments,
  } = useComments(path);

  const { content } = useDocument(path);
  const { sidecarBranchExists } = useDocuments();

  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    quote: string;
    context: {
      prefix: string;
      suffix: string;
    };
    offset: number;
  } | null>(null);
  const [renderedText, setRenderedText] = useState(content);

  useEffect(() => {
    setRenderedText(content);
  }, [path]);

  return (
    <AppLayout
      sidebar={<DocumentTree />}
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
          onRenderedText={setRenderedText}
        />
      }
      aside={
        <CommentsSidebar
          comments={threads}
          documentText={renderedText}
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
          deleteThread={deleteThread}
          deleteReply={deleteReply}
          saveComments={saveComments}
          isDirty={isDirty}
          isSaving={isSaving}
          sidecarBranchMissing={!sidecarBranchExists}
        />
      }
    />
  );
}
