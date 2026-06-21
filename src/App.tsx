import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';

import {
  AuthError,
  RATE_LIMIT_EVENT,
  RateLimitError,
} from './lib/github/client';
import { AuthGate } from './components/auth/AuthGate';
import { Header } from './components/layout/Header';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider, useToast } from './hooks/useToast';
import { Home } from './routes/Home';
import { ProposalEdit } from './routes/ProposalEdit';
import { ProposalView } from './routes/ProposalView';
import { Settings } from './routes/Settings';
import type { RateLimitInfo } from './types/github';

function ProposalRoute() {
  const location = useLocation();

  if (location.pathname.endsWith('/edit')) {
    return <ProposalEdit />;
  }

  return <ProposalView />;
}

function AppShell() {
  const { showToast } = useToast();
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  useEffect(() => {
    const handleRateLimit = (event: Event) => {
      const next = (event as CustomEvent<RateLimitInfo>).detail;
      setRateLimit(next);
    };

    window.addEventListener(RATE_LIMIT_EVENT, handleRateLimit);
    return () => {
      window.removeEventListener(RATE_LIMIT_EVENT, handleRateLimit);
    };
  }, []);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof AuthError) {
              showToast({
                tone: 'error',
                title: 'Your session has expired. Please re-enter your PAT.',
              });
              return;
            }

            if (error instanceof RateLimitError) {
              showToast({ tone: 'error', title: error.message });
              return;
            }

            const title =
              error instanceof Error
                ? error.message
                : 'Unexpected request failure';
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
            <Header rateLimit={rateLimit} />
            {rateLimit &&
            rateLimit.limit > 0 &&
            rateLimit.remaining === 0 &&
            rateLimit.reset.getTime() > Date.now() ? (
              <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                API rate limit exceeded. Resets at{' '}
                {rateLimit.reset.toLocaleTimeString()}.
              </div>
            ) : null}
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/proposals/*" element={<ProposalRoute />} />
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
