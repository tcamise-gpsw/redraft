import { useCallback, useRef, useState, type ReactNode } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  aside?: ReactNode;
}

const SIDEBAR_MIN = 180;
const SIDEBAR_DEFAULT = 300;
const ASIDE_MIN = 240;
const ASIDE_DEFAULT = 420;
const MAIN_MIN = 360;

function ResizeHandle({
  onDrag,
  side,
}: {
  onDrag: (delta: number) => void;
  side: 'left' | 'right';
}) {
  const dragging = useRef(false);
  const last = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    last.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const delta = e.clientX - last.current;
      last.current = e.clientX;
      onDrag(side === 'left' ? delta : -delta);
    },
    [onDrag, side],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="group relative z-10 hidden w-3 shrink-0 cursor-col-resize select-none items-center justify-center lg:flex"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* visible track */}
      <div className="h-full w-px bg-slate-800 transition-colors group-hover:bg-slate-500 group-active:bg-cyan-500" />
      {/* drag arrow pill */}
      <div className="absolute top-1/2 -translate-y-1/2 flex h-8 w-3 flex-col items-center justify-center gap-0.5 rounded-full bg-slate-800 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100">
        <svg
          aria-hidden="true"
          className="h-3 w-3 text-slate-400"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M5 8a1 1 0 01.707-.707l2-2a1 1 0 011.414 1.414L7.414 8l1.707 1.293a1 1 0 01-1.414 1.414l-2-2A1 1 0 015 8z" />
          <path d="M11 8a1 1 0 00-.707-.707l-2-2a1 1 0 00-1.414 1.414L8.586 8l-1.707 1.293a1 1 0 001.414 1.414l2-2A1 1 0 0011 8z" />
        </svg>
      </div>
    </div>
  );
}

export function AppLayout({ sidebar, main, aside }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [asideOpen, setAsideOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [asideWidth, setAsideWidth] = useState(ASIDE_DEFAULT);

  const dragSidebar = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w + delta));
  }, []);

  const dragAside = useCallback((delta: number) => {
    setAsideWidth((w) => Math.max(ASIDE_MIN, w + delta));
  }, []);

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-50"
      data-testid="app-layout-root"
    >
      {/* mobile top bar */}
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

      {/* desktop: flex row with drag handles */}
      <div
        className="mx-auto max-w-[1920px] lg:flex lg:min-h-[calc(100vh-65px)]"
        data-testid="app-layout"
      >
        {/* sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className={[
            'shrink-0 border-b border-slate-800 bg-slate-900/60 p-4 lg:block lg:border-b-0 lg:border-r',
            sidebarOpen ? 'block' : 'hidden',
          ].join(' ')}
          data-testid="app-layout-sidebar"
        >
          {sidebar}
        </aside>

        <ResizeHandle onDrag={dragSidebar} side="left" />

        {/* main */}
        <main
          className="flex-1 min-h-[60vh] p-4 lg:p-6"
          style={{ minWidth: MAIN_MIN }}
          data-testid="app-layout-main"
        >
          {main}
        </main>

        <ResizeHandle onDrag={dragAside} side="right" />

        {/* aside */}
        <aside
          style={{ width: asideWidth }}
          className={[
            'shrink-0 border-t border-slate-800 bg-slate-900/40 p-4 lg:block lg:border-l lg:border-t-0',
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
