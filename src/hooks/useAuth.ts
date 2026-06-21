import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AuthError, GitHubClient } from '../lib/github';
import {
  AUTH_ERROR_EVENT,
  clearStoredAuth,
  getStoredAuth,
  setStoredAuth,
  type StoredAuth,
} from '../lib/auth';
import type { User } from '../types/github';

interface RepoConfig {
  owner: string;
  repo: string;
}

interface AuthContextValue {
  user: User | null;
  pat: string | null;
  repo: RepoConfig | null;
  isAuthenticated: boolean;
  login: (pat: string, owner: string, repo: string) => Promise<void>;
  logout: () => void;
  updateRepo: (owner: string, repo: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toState(auth: StoredAuth | null) {
  if (!auth) {
    return {
      user: null,
      pat: null,
      repo: null,
    } satisfies Pick<AuthContextValue, 'user' | 'pat' | 'repo'>;
  }

  return {
    user: auth.user,
    pat: auth.pat,
    repo: {
      owner: auth.owner,
      repo: auth.repo,
    },
  } satisfies Pick<AuthContextValue, 'user' | 'pat' | 'repo'>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => toState(getStoredAuth()));

  const logout = useCallback(() => {
    clearStoredAuth();
    setState(toState(null));
  }, []);

  const login = useCallback(async (pat: string, owner: string, repo: string) => {
    try {
      const client = new GitHubClient({ pat, owner, repo });
      const user = await client.validateAuth();
      const stored = { pat, owner, repo, user } satisfies StoredAuth;

      setStoredAuth(stored);
      setState(toState(stored));
    } catch (error) {
      clearStoredAuth();
      setState(toState(null));
      throw error;
    }
  }, []);

  const updateRepo = useCallback(
    (owner: string, repo: string) => {
      if (!state.pat || !state.user) {
        return;
      }

      const stored = { pat: state.pat, owner, repo, user: state.user } satisfies StoredAuth;
      setStoredAuth(stored);
      setState(toState(stored));
    },
    [state.pat, state.user],
  );

  useEffect(() => {
    const handleAuthError = () => {
      logout();
    };

    window.addEventListener(AUTH_ERROR_EVENT, handleAuthError);

    return () => {
      window.removeEventListener(AUTH_ERROR_EVENT, handleAuthError);
    };
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      pat: state.pat,
      repo: state.repo,
      isAuthenticated: Boolean(state.user && state.pat && state.repo),
      login,
      logout,
      updateRepo,
    }),
    [login, logout, state.pat, state.repo, state.user, updateRepo],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export function isInvalidAuthError(error: unknown): boolean {
  if (error instanceof AuthError) {
    return true;
  }

  return error instanceof Error && /auth|token/i.test(error.message);
}
