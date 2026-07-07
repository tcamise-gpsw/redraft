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
  getStoredBranch,
  setStoredAuth,
  setStoredBranch,
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
  branch: string | null;
  defaultBranch: string | null;
  isAuthenticated: boolean;
  login: (pat: string, owner: string, repo: string) => Promise<void>;
  logout: () => void;
  updateRepo: (owner: string, repo: string) => void;
  setBranch: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface BranchState {
  branch: string | null;
  defaultBranch: string | null;
}

export const BRANCH_WARNING_EVENT = 'redraft:branch-warning';

function emptyBranchState(): BranchState {
  return { branch: null, defaultBranch: null };
}

function dispatchBranchWarning(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(BRANCH_WARNING_EVENT, {
      detail: { title: 'Could not determine default branch' },
    }),
  );
}

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
  const [branchState, setBranchState] = useState<BranchState>(emptyBranchState);

  const loadBranchState = useCallback(
    async (pat: string, owner: string, repo: string): Promise<BranchState> => {
      if (localMode) {
        return emptyBranchState();
      }

      try {
        const client = new GitHubClient({
          pat,
          owner,
          repo,
          baseUrl: getApiBaseUrl(),
        });
        const defaultBranch = await client.getDefaultBranch();
        return {
          defaultBranch,
          branch: getStoredBranch(owner, repo) ?? defaultBranch,
        };
      } catch {
        dispatchBranchWarning();
        return {
          defaultBranch: null,
          branch: getStoredBranch(owner, repo),
        };
      }
    },
    [localMode],
  );

  const logout = useCallback(() => {
    setBranchState(emptyBranchState());

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
        setBranchState(emptyBranchState());
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
        const nextBranchState = await loadBranchState(pat, owner, repo);

        setStoredAuth(stored);
        setState(toState(stored));
        setBranchState(nextBranchState);
      } catch (error) {
        clearStoredAuth();
        setState(toState(null));
        setBranchState(emptyBranchState());
        throw error;
      }
    },
    [loadBranchState, localMode],
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
      setBranchState(emptyBranchState());
      void loadBranchState(state.pat, owner, repo).then(setBranchState);
    },
    [loadBranchState, localMode, state.pat, state.user],
  );

  const setBranch = useCallback(
    (name: string) => {
      if (localMode || !state.repo) {
        return;
      }

      setStoredBranch(state.repo.owner, state.repo.repo, name);
      setBranchState((current) => ({ ...current, branch: name }));
    },
    [localMode, state.repo],
  );

  useEffect(() => {
    if (localMode || !state.pat || !state.repo) {
      setBranchState(emptyBranchState());
      return;
    }

    let canceled = false;

    void loadBranchState(state.pat, state.repo.owner, state.repo.repo).then(
      (nextBranchState) => {
        if (!canceled) {
          setBranchState(nextBranchState);
        }
      },
    );

    return () => {
      canceled = true;
    };
  }, [loadBranchState, localMode, state.pat, state.repo]);

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
      branch: branchState.branch,
      defaultBranch: branchState.defaultBranch,
      isAuthenticated: Boolean(state.user && state.pat && state.repo),
      login,
      logout,
      updateRepo,
      setBranch,
    }),
    [
      branchState.branch,
      branchState.defaultBranch,
      login,
      logout,
      setBranch,
      state.pat,
      state.repo,
      state.user,
      updateRepo,
    ],
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
