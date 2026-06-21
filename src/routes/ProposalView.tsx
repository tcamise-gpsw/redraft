import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { AppLayout } from '../components/layout/AppLayout';
import { DocumentView } from '../components/document/DocumentView';
import { ProposalTree } from '../components/tree/ProposalTree';

export function ProposalView() {
  const params = useParams();
  const path = useMemo(() => {
    const wildcard = params['*'];
    return wildcard ? `proposals/${wildcard}` : 'proposals/unknown.md';
  }, [params]);

  return (
    <AppLayout
      sidebar={<ProposalTree />}
      main={<DocumentView path={path} />}
      aside={<div className="text-sm text-slate-300">Comments sidebar placeholder</div>}
    />
  );
}
