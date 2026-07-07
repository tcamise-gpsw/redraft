import type { User } from '../../types/github';

const STORAGE_KEY = 'redraft.auth';
export const AUTH_ERROR_EVENT = 'redraft:auth-error';

function branchStorageKey(owner: string, repo: string): string {
  return `redraft.branch.${owner}/${repo}`;
}

function sidecarBranchStorageKey(owner: string, repo: string): string {
  return `redraft.sidecarBranch.${owner}/${repo}`;
}

export interface StoredAuth {
  pat: string;
  owner: string;
  repo: string;
  user: User;
}

export function getStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuth;

    if (
      typeof parsed.pat !== 'string' ||
      typeof parsed.owner !== 'string' ||
      typeof parsed.repo !== 'string' ||
      !parsed.user ||
      typeof parsed.user.login !== 'string' ||
      typeof parsed.user.avatarUrl !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStoredBranch(owner: string, repo: string): string | null {
  const raw = localStorage.getItem(branchStorageKey(owner, repo));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredBranch(
  owner: string,
  repo: string,
  branch: string,
): void {
  localStorage.setItem(branchStorageKey(owner, repo), JSON.stringify(branch));
}

export function getStoredSidecarBranch(
  owner: string,
  repo: string,
): string | null {
  const raw = localStorage.getItem(sidecarBranchStorageKey(owner, repo));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredSidecarBranch(
  owner: string,
  repo: string,
  branch: string,
): void {
  localStorage.setItem(
    sidecarBranchStorageKey(owner, repo),
    JSON.stringify(branch),
  );
}

export function dispatchAuthError(): void {
  window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
}
