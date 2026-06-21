import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { AuthGate } from './components/auth/AuthGate';
import { Header } from './components/layout/Header';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider, useToast } from './hooks/useToast';
import { Home } from './routes/Home';
import { ProposalEdit } from './routes/ProposalEdit';
import { ProposalView } from './routes/ProposalView';
import { Settings } from './routes/Settings';

function AppShell() {
  const { showToast } = useToast();

  const queryClient = useMemo(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            const title = error instanceof Error ? error.message : 'Unexpected request failure';
            showToast({ tone: 'error', title });
          },
        }),
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
    [showToast],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <AuthGate>
            <Header
              rateLimit={{
                remaining: 0,
                limit: 0,
                reset: new Date(0),
              }}
            />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/proposals/*/edit" element={<ProposalEdit />} />
              <Route path="/proposals/*" element={<ProposalView />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </AuthGate>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

export default App;
