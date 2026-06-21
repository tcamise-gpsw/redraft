import { useState } from 'react';

import { useDocuments } from '../../hooks/useDocuments';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { CreateProposalDialog } from './CreateProposalDialog';
import { TreeNode } from './TreeNode';

export function ProposalTree() {
  const { documents: tree, isLoading, error } = useDocuments();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
          Proposals
        </h2>
        <Button
          className="px-3 py-1.5 text-sm"
          onClick={() => setDialogOpen(true)}
          type="button"
        >
          New Proposal
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Spinner />
          <span>Loading proposals…</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          <p>Unable to load proposals.</p>
          <p className="mt-1 text-rose-200/80">{error.message}</p>
        </div>
      ) : null}

      {!isLoading && !error && tree.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
          No proposals yet.
        </div>
      ) : null}

      {!isLoading && !error && tree.length > 0 ? (
        <ul className="space-y-2 overflow-y-auto" role="tree">
          {tree.map((node) => (
            <TreeNode key={node.path} node={node} />
          ))}
        </ul>
      ) : null}

      <CreateProposalDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </section>
  );
}
