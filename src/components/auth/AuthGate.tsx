import type { ReactNode } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { AuthForm } from './AuthForm';

export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return <>{children}</>;
}
