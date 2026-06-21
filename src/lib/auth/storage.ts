import type { User } from '../../types/github';

const STORAGE_KEY = 'proposal-review.auth';
export const AUTH_ERROR_EVENT = 'proposal-review:auth-error';

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

export function dispatchAuthError(): void {
  window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT));
}
