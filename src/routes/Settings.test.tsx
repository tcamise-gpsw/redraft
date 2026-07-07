// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logout = vi.hoisted(() => vi.fn());
const updateRepo = vi.hoisted(() => vi.fn());
const setSidecarBranch = vi.hoisted(() => vi.fn());
const localMode = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    repo: { owner: 'acme', repo: 'workspace' },
    logout,
    updateRepo,
    sidecarBranch: 'redraft',
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

  it('does not render the comments branch setting in local mode', () => {
    localMode.mockReturnValue(true);

    render(<Settings />);

    expect(screen.queryByLabelText(/comments branch/i)).not.toBeInTheDocument();
  });
});
