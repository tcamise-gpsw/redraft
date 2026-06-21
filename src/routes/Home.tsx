import { DocumentTree } from '../components/tree/DocumentTree';
import { AppLayout } from '../components/layout/AppLayout';

export function Home() {
  return (
    <AppLayout
      sidebar={<DocumentTree />}
      main={
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h1 className="text-3xl font-semibold">Welcome</h1>
          <p className="text-sm text-slate-300">
            Choose a document from the tree to start reviewing markdown,
            comments, and suggestions.
          </p>
        </div>
      }
      aside={
        <div className="text-sm text-slate-300">
          Select a document to load its comment threads.
        </div>
      }
    />
  );
}
