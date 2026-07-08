// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const login = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useAuth', () => ({
  isInvalidAuthError: () => false,
  useAuth: () => ({
    login,
  }),
}));

vi.mock('../../../lib/github', () => ({
  NetworkError: class NetworkError extends Error {},
}));

import { AuthForm } from '../AuthForm';

describe('AuthForm', () => {
  beforeEach(() => {
    login.mockReset().mockResolvedValue(undefined);
    window.location.hash = '';
  });

  it('prefills the repository field from URL params', () => {
    window.location.hash = '#/d/spec.md?repo=acme/proj&branch=review-1';

    render(<AuthForm />);

    expect(screen.getByLabelText(/repository/i)).toHaveValue('acme/proj');
  });

  it('leaves the repository field empty when no URL repo param exists', () => {
    render(<AuthForm />);

    expect(screen.getByLabelText(/repository/i)).toHaveValue('');
  });

  it('passes URL branch to login as an override branch', async () => {
    window.location.hash = '#/d/spec.md?repo=acme/proj&branch=review-1';

    render(<AuthForm />);

    fireEvent.change(screen.getByLabelText(/github pat/i), {
      target: { value: 'ghp_test' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /connect/i }).closest('form')!,
    );

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        'ghp_test',
        'acme',
        'proj',
        'review-1',
      );
    });
  });

  it('does not pass an override branch when the URL omits branch', async () => {
    render(<AuthForm />);

    fireEvent.change(screen.getByLabelText(/github pat/i), {
      target: { value: 'ghp_test' },
    });
    fireEvent.change(screen.getByLabelText(/repository/i), {
      target: { value: 'acme/proj' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /connect/i }).closest('form')!,
    );

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('ghp_test', 'acme', 'proj', undefined);
    });
  });
});
