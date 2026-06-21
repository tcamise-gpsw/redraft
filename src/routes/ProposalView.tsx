import { AppLayout } from '../components/layout/AppLayout';

export function ProposalView() {
  return (
    <AppLayout
      sidebar={<div className="text-sm text-slate-300">Proposal tree placeholder</div>}
      main={
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h1 className="text-3xl font-semibold">Proposal view placeholder</h1>
          <p className="text-sm text-slate-300">
            Markdown rendering and file loading arrive in Task 6.
          </p>
        </div>
      }
      aside={<div className="text-sm text-slate-300">Comments sidebar placeholder</div>}
    />
  );
}
