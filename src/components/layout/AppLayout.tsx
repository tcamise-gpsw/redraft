import { useState, type ReactNode } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
}

export function AppLayout({ sidebar, main, aside }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [asideOpen, setAsideOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50" data-testid="app-layout-root">
      <div className="border-b border-slate-800 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium"
          >
            Navigation
          </button>
          {aside ? (
            <button
              type="button"
              onClick={() => setAsideOpen((open) => !open)}
              className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium"
            >
              Comments
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] lg:grid lg:min-h-[calc(100vh-65px)] lg:grid-cols-[240px_minmax(0,1fr)_320px]" data-testid="app-layout">
        <aside
          className={[
            'border-b border-slate-800 bg-slate-900/60 p-4 lg:block lg:border-b-0 lg:border-r',
            sidebarOpen ? 'block' : 'hidden',
          ].join(' ')}
          data-testid="app-layout-sidebar"
        >
          {sidebar}
        </aside>

        <main className="min-h-[60vh] p-4 lg:p-6" data-testid="app-layout-main">
          {main}
        </main>

        <aside
          className={[
            'border-t border-slate-800 bg-slate-900/40 p-4 lg:block lg:border-l lg:border-t-0',
            aside ? (asideOpen ? 'block' : 'hidden') : 'hidden',
          ].join(' ')}
          data-testid="app-layout-aside"
        >
          {aside}
        </aside>
      </div>
    </div>
  );
}
