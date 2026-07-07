// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateAuth = vi.hoisted(() => vi.fn());
const getDefaultBranch = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/github/client', () => ({
  AuthError: class AuthError extends Error {},
  NetworkError: class NetworkError extends Error {},
  GitHubClient: class GitHubClient {
    validateAuth = validateAuth;
    getDefaultBranch = getDefaultBranch;
  },
}));

import { AuthGate } from '../AuthGate';
import { AuthProvider } from '../../../hooks/useAuth';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe('AuthGate', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    validateAuth.mockReset();
    getDefaultBranch.mockReset().mockResolvedValue('main');
  });

  it('renders the auth form when there is no stored auth', () => {
    render(
      <AuthProvider>
        <AuthGate>
          <div>private content</div>
        </AuthGate>
      </AuthProvider>,
    );

    expect(screen.getByLabelText(/github pat/i)).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.getByLabelText(/repository/i)).toHaveValue('');
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });

  it('renders children when stored auth exists', async () => {
    localStorage.setItem(
      'redraft.auth',
      JSON.stringify({
        pat: 'ghp_test',
        owner: 'acme',
        repo: 'workspace',
        user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
      }),
    );

    render(
      <AuthProvider>
        <AuthGate>
          <div>private content</div>
        </AuthGate>
      </AuthProvider>,
    );

    expect(screen.getByText('private content')).toBeInTheDocument();
    await waitFor(() => expect(getDefaultBranch).toHaveBeenCalled());
  });

  it('shows an error for invalid PAT responses', async () => {
    validateAuth.mockRejectedValueOnce(new Error('Authentication failed'));

    render(
      <AuthProvider>
        <AuthGate>
          <div>private content</div>
        </AuthGate>
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText(/github pat/i), {
      target: { value: 'ghp_bad' },
    });
    fireEvent.change(screen.getByLabelText(/repository/i), {
      target: { value: 'acme/workspace' },
    });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid token/i)).toBeInTheDocument();
    });
  });

  it('calls login and renders children for a valid submit', async () => {
    validateAuth.mockResolvedValueOnce({
      login: 'jdoe',
      avatarUrl: 'https://example.com/avatar.png',
    });

    render(
      <AuthProvider>
        <AuthGate>
          <div>private content</div>
        </AuthGate>
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText(/github pat/i), {
      target: { value: 'ghp_good' },
    });
    fireEvent.change(screen.getByLabelText(/repository/i), {
      target: { value: 'acme/workspace' },
    });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(validateAuth).toHaveBeenCalledTimes(1);
      expect(screen.getByText('private content')).toBeInTheDocument();
    });
  });
});
