import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

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
import { ProposalView } from './routes/ProposalView';
import { Settings } from './routes/Settings';
import type { RateLimitInfo } from './types/github';

function ProposalRoute() {
  return <ProposalView />;
}

function AppShell() {
  const { showToast } = useToast();
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  useEffect(() => {
    const handleRateLimit = (event: Event) => {
      const customEvent = event as CustomEvent<RateLimitInfo>;
      setRateLimit(customEvent.detail);
      showToast({
        tone: 'error',
        title: `GitHub rate limit hit. Resets at ${customEvent.detail.reset.toLocaleTimeString()}.`,
      });
    };

    window.addEventListener(RATE_LIMIT_EVENT, handleRateLimit as EventListener);
    return () => {
      window.removeEventListener(
        RATE_LIMIT_EVENT,
        handleRateLimit as EventListener,
      );
    };
  }, [showToast]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof AuthError) {
              showToast({
                tone: 'error',
                title: error.message,
              });
              return;
            }

            if (error instanceof RateLimitError) {
              showToast({
                tone: 'error',
                title: error.message,
              });
              return;
            }

            showToast({
              tone: 'error',
              title:
                error instanceof Error
                  ? error.message
                  : 'Unexpected application error',
            });
          },
        }),
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 10_000,
          },
        },
      }),
    [showToast],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Header rateLimit={rateLimit} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/proposals/*" element={<ProposalRoute />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthGate>
          <AppShell />
        </AuthGate>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
