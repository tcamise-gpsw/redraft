function App() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1 text-sm font-medium text-cyan-200">
          Proposal Review Workspace
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Review proposal markdown directly from GitHub.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
          This repository now contains the Vite, React, TypeScript, and Tailwind
          scaffolding for the MVP described in the approved design and
          implementation plan.
        </p>
      </div>
    </main>
  );
}

export default App;
