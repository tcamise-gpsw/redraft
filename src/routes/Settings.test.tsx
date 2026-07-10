// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logout = vi.hoisted(() => vi.fn());
const updateRepo = vi.hoisted(() => vi.fn());
const setSidecarBranch = vi.hoisted(() => vi.fn());
const localMode = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

const authState = vi.hoisted(() => ({
  sidecarBranch: 'redraft' as string | null,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    repo: { owner: 'acme', repo: 'workspace' },
    logout,
    updateRepo,
    sidecarBranch: authState.sidecarBranch,
    setSidecarBranch,
  }),
}));

vi.mock('../lib/mode', () => ({
  isLocalMode: localMode,
}));

import { Settings } from './Settings';

describe('Settings', () => {
  beforeEach(() => {
    logout.mockReset();
    updateRepo.mockReset();
    setSidecarBranch.mockReset();
    localMode.mockReset().mockReturnValue(false);
    navigate.mockReset();
    authState.sidecarBranch = 'redraft';
  });

  it('renders and saves the remote comments branch setting', () => {
    render(<Settings />);

    const input = screen.getByLabelText(/comments branch/i);
    expect(input).toHaveValue('redraft');

    fireEvent.change(input, { target: { value: 'review-data' } });
    fireEvent.click(screen.getByRole('button', { name: /save repository/i }));

    expect(setSidecarBranch).toHaveBeenCalledWith('review-data');
    expect(screen.getByText('Repository updated.')).toBeInTheDocument();
  });

  it('updates the comments branch input when auth state hydrates asynchronously', () => {
    authState.sidecarBranch = null;

    const { rerender } = render(<Settings />);

    expect(screen.getByLabelText(/comments branch/i)).toHaveValue('redraft');

    authState.sidecarBranch = 'review-data';
    rerender(<Settings />);

    expect(screen.getByLabelText(/comments branch/i)).toHaveValue(
      'review-data',
    );
  });

  it('passes the submitted comments branch when changing repository', () => {
    render(<Settings />);

    fireEvent.change(screen.getByLabelText(/^Repository$/i), {
      target: { value: 'octo/project' },
    });
    fireEvent.change(screen.getByLabelText(/comments branch/i), {
      target: { value: 'review-data' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save repository/i }));

    expect(updateRepo).toHaveBeenCalledWith('octo', 'project', 'review-data');
  });
  it('does not render the comments branch setting in local mode', () => {
    localMode.mockReturnValue(true);

    render(<Settings />);

    expect(screen.queryByLabelText(/comments branch/i)).not.toBeInTheDocument();
  });
  it('shows a close button that navigates back in github mode', () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('shows a close button that navigates back in local mode', () => {
    localMode.mockReturnValue(true);
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });
});
