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
  getStoredSidecarBranch,
  setStoredAuth,
  setStoredBranch,
  setStoredSidecarBranch,
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
  sidecarBranch: string | null;
  isAuthenticated: boolean;
  login: (
    pat: string,
    owner: string,
    repo: string,
    overrideBranch?: string,
  ) => Promise<void>;
  logout: () => void;
  updateRepo: (
    owner: string,
    repo: string,
    sidecarBranch?: string,
    overrideBranch?: string,
  ) => void;
  setBranch: (name: string) => void;
  setSidecarBranch: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface BranchState {
  branch: string | null;
  defaultBranch: string | null;
  sidecarBranch: string | null;
}

export const BRANCH_WARNING_EVENT = 'redraft:branch-warning';

function emptyBranchState(): BranchState {
  return { branch: null, defaultBranch: null, sidecarBranch: null };
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

async function loadLocalBranch(): Promise<string> {
  if (typeof window === 'undefined') {
    return 'main';
  }

  try {
    const response = await fetch(`${window.location.origin}/api/git/branch`);
    if (!response.ok) {
      return 'main';
    }
    const body = (await response.json()) as { branch?: unknown };
    const value =
      typeof body.branch === 'string' && body.branch.length > 0
        ? body.branch
        : 'main';
    return value === 'HEAD' ? 'main' : value;
  } catch {
    return 'main';
  }
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
    async (
      pat: string,
      owner: string,
      repo: string,
      overrideBranch?: string,
    ): Promise<BranchState> => {
      if (localMode) {
        return {
          branch: await loadLocalBranch(),
          defaultBranch: null,
          sidecarBranch: null,
        };
      }

      try {
        const client = new GitHubClient({
          pat,
          owner,
          repo,
          baseUrl: getApiBaseUrl(),
        });
        const defaultBranch = await client.getDefaultBranch();
        if (overrideBranch) {
          setStoredBranch(owner, repo, overrideBranch);
        }
        return {
          defaultBranch,
          branch:
            overrideBranch ?? getStoredBranch(owner, repo) ?? defaultBranch,
          sidecarBranch: getStoredSidecarBranch(owner, repo) ?? 'redraft',
        };
      } catch {
        dispatchBranchWarning();
        return {
          defaultBranch: null,
          branch: overrideBranch ?? getStoredBranch(owner, repo),
          sidecarBranch: getStoredSidecarBranch(owner, repo) ?? 'redraft',
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
    async (
      pat: string,
      owner: string,
      repo: string,
      overrideBranch?: string,
    ) => {
      if (localMode) {
        setBranchState(await loadBranchState(pat, owner, repo, overrideBranch));
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
        const nextBranchState = await loadBranchState(
          pat,
          owner,
          repo,
          overrideBranch,
        );

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
    (
      owner: string,
      repo: string,
      sidecarBranch?: string,
      overrideBranch?: string,
    ) => {
      if (localMode || !state.pat || !state.user) {
        return;
      }

      if (sidecarBranch) {
        setStoredSidecarBranch(owner, repo, sidecarBranch);
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
      void loadBranchState(state.pat, owner, repo, overrideBranch).then(
        setBranchState,
      );
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

  const setSidecarBranch = useCallback(
    (name: string) => {
      if (localMode || !state.repo) {
        return;
      }

      setStoredSidecarBranch(state.repo.owner, state.repo.repo, name);
      setBranchState((current) => ({ ...current, sidecarBranch: name }));
    },
    [localMode, state.repo],
  );

  useEffect(() => {
    if (localMode) {
      let canceled = false;
      void loadLocalBranch().then((branch) => {
        if (!canceled) {
          setBranchState({ branch, defaultBranch: null, sidecarBranch: null });
        }
      });

      return () => {
        canceled = true;
      };
    }

    if (!state.pat || !state.repo) {
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
      sidecarBranch: branchState.sidecarBranch,
      isAuthenticated: Boolean(state.user && state.pat && state.repo),
      login,
      logout,
      updateRepo,
      setBranch,
      setSidecarBranch,
    }),
    [
      branchState.branch,
      branchState.defaultBranch,
      branchState.sidecarBranch,
      login,
      logout,
      setBranch,
      state.pat,
      setSidecarBranch,
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
