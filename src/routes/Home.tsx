import { AppLayout } from '../components/layout/AppLayout';

export function Home() {
  return (
    <AppLayout
      sidebar={<div className="text-sm text-slate-300">Proposal tree placeholder</div>}
      main={
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h1 className="text-3xl font-semibold">Welcome</h1>
          <p className="text-sm text-slate-300">
            Choose a proposal from the tree once the data layer lands.
          </p>
        </div>
      }
      aside={<div className="text-sm text-slate-300">Comments sidebar placeholder</div>}
    />
  );
}
