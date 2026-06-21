import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { AuthError, GitHubClient } from '../lib/github';
import {
  AUTH_ERROR_EVENT,
  clearStoredAuth,
  getStoredAuth,
  setStoredAuth,
  type StoredAuth,
} from '../lib/auth';
import { getApiBaseUrl, isLocalMode } from '../lib/mode';
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

const LOCAL_AUTH: StoredAuth = {
  pat: 'local',
  owner: 'local',
  repo: 'redraft',
  user: {
    login: 'local-user',
    avatarUrl: '',
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const localMode = isLocalMode();
  const [state, setState] = useState(() =>
    toState(localMode ? LOCAL_AUTH : getStoredAuth()),
  );

  const logout = useCallback(() => {
    if (localMode) {
      setState(toState(LOCAL_AUTH));
      return;
    }

    clearStoredAuth();
    setState(toState(null));
  }, [localMode]);

  const login = useCallback(
    async (pat: string, owner: string, repo: string) => {
      if (localMode) {
        setState(toState(LOCAL_AUTH));
        return;
      }

      try {
        const client = new GitHubClient({
          pat,
          owner,
          repo,
          baseUrl: getApiBaseUrl(),
        });
        const user = await client.validateAuth();
        const stored = { pat, owner, repo, user } satisfies StoredAuth;

        setStoredAuth(stored);
        setState(toState(stored));
      } catch (error) {
        clearStoredAuth();
        setState(toState(null));
        throw error;
      }
    },
    [localMode],
  );

  const updateRepo = useCallback(
    (owner: string, repo: string) => {
      if (localMode || !state.pat || !state.user) {
        return;
      }

      const stored = {
        pat: state.pat,
        owner,
        repo,
        user: state.user,
      } satisfies StoredAuth;
      setStoredAuth(stored);
      setState(toState(stored));
    },
    [localMode, state.pat, state.user],
  );

  useEffect(() => {
    if (localMode) {
      return;
    }

    const handleAuthError = () => {
      logout();
    };

    window.addEventListener(AUTH_ERROR_EVENT, handleAuthError);

    return () => {
      window.removeEventListener(AUTH_ERROR_EVENT, handleAuthError);
    };
  }, [localMode, logout]);

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
