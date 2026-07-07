import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useDocuments } from '../../hooks/useDocuments';
import { Spinner } from '../ui/Spinner';
import { CreateDocumentDialog } from './CreateDocumentDialog';
import { BranchSelector } from './BranchSelector';
import { TreeNode } from './TreeNode';

export function DocumentTree() {
  const { documents, underReview, isLoading, error } = useDocuments();
  const location = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentsExpanded, setDocumentsExpanded] = useState(true);
  const reviewPaths = useMemo(
    () => new Set(underReview.map((entry) => entry.path)),
    [underReview],
  );

  return (
    <section className="flex h-full flex-col gap-4">
      <BranchSelector />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
          Documents
        </h2>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full rounded-md bg-cyan-500 px-2 py-1 text-xs font-medium text-slate-950 transition hover:bg-cyan-400"
        >
          New Document
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Spinner />
          <span>Loading documents…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          <p>Unable to load documents.</p>
          <p className="mt-1 text-rose-200/80">{error.message}</p>
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Under Review
            </h3>
            {underReview.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-sm text-slate-300">
                No documents under review.
              </div>
            ) : (
              <ul className="space-y-1">
                {underReview.map((entry) => {
                  const routePath = `/d/${entry.path}`;
                  const active = location.pathname === routePath;

                  return (
                    <li key={entry.path}>
                      <Link
                        to={routePath}
                        className={[
                          'flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-slate-100',
                          active ? 'bg-cyan-500/10 text-cyan-200' : '',
                        ].join(' ')}
                        title={entry.path}
                      >
                        <span className="truncate">{entry.path}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                          {entry.unresolvedCount}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setDocumentsExpanded((value) => !value)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <span aria-hidden="true">{documentsExpanded ? '▾' : '▸'}</span>
              <span>Documents</span>
            </button>

            {documentsExpanded ? (
              documents.length > 0 ? (
                <ul className="space-y-2" role="tree">
                  {documents.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      reviewPaths={reviewPaths}
                    />
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
                  No documents yet.
                </div>
              )
            ) : null}
          </section>
        </div>
      ) : null}

      <CreateDocumentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </section>
  );
}
