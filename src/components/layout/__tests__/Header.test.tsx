// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const copyLink = vi.hoisted(() => vi.fn());
const isLocalMode = vi.hoisted(() => vi.fn());

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
  }),
}));

vi.mock('../../../hooks/useShareableLink', () => ({
  useShareableLink: () => ({
    copyLink,
  }),
}));

vi.mock('../../../lib/mode', () => ({
  isLocalMode,
}));

import { Header } from '../Header';

function renderHeader(
  rateLimit?: Parameters<typeof Header>[0]['rateLimit'],
  initialEntry = '/',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Header rateLimit={rateLimit} />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  beforeEach(() => {
    copyLink.mockReset().mockResolvedValue(true);
    isLocalMode.mockReset().mockReturnValue(false);
  });

  it('displays remaining quota count', () => {
    renderHeader({ remaining: 4750, limit: 5000, reset: new Date() });

    expect(screen.getByText('4750 / 5000')).toBeInTheDocument();
  });

  it('shows a progress bar when rate limit info is provided', () => {
    renderHeader({ remaining: 3200, limit: 5000, reset: new Date() });

    // The quota meter span contains the formatted numbers
    expect(screen.getByText('3200 / 5000')).toBeInTheDocument();
  });

  it('shows red text when fewer than 10% of quota remains', () => {
    renderHeader({ remaining: 42, limit: 5000, reset: new Date() });

    const label = screen.getByText('42 / 5000');
    expect(label).toHaveClass('text-red-400');
  });

  it('shows amber text when 10–25% of quota remains', () => {
    renderHeader({ remaining: 1000, limit: 5000, reset: new Date() });

    const label = screen.getByText('1000 / 5000');
    expect(label).toHaveClass('text-amber-300');
  });

  it('shows normal text when plenty of quota remains', () => {
    renderHeader({ remaining: 4999, limit: 5000, reset: new Date() });

    const label = screen.getByText('4999 / 5000');
    expect(label).toHaveClass('text-slate-300');
    expect(label).not.toHaveClass('text-amber-300');
    expect(label).not.toHaveClass('text-red-400');
  });

  it('hides rate-limit display when no rateLimit is provided', () => {
    renderHeader(undefined);

    expect(screen.queryByText(/\/\s*5000/u)).toBeNull();
  });

  it('shows rate-limit display when rateLimit is provided', () => {
    renderHeader({ remaining: 1234, limit: 5000, reset: new Date() });

    expect(screen.getByText('1234 / 5000')).toBeInTheDocument();
  });

  it('renders a Copy Link button in remote mode', () => {
    renderHeader(undefined, '/d/docs/spec.md');

    expect(
      screen.getByRole('button', { name: /copy link/i }),
    ).toBeInTheDocument();
  });

  it('hides Copy Link button in local mode', () => {
    isLocalMode.mockReturnValue(true);

    renderHeader(undefined, '/d/docs/spec.md');

    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
  });

  it('copies the current document path when clicked', async () => {
    renderHeader(undefined, '/d/docs/spec.md');

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => {
      expect(copyLink).toHaveBeenCalledWith('docs/spec.md');
    });
  });

  it('shows a copied state after copying succeeds', async () => {
    renderHeader(undefined, '/d/docs/spec.md');

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(
      await screen.findByRole('button', { name: /copied/i }),
    ).toBeInTheDocument();
  });

  it('copies a context link without a document path outside document routes', async () => {
    renderHeader(undefined, '/settings');

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    await waitFor(() => {
      expect(copyLink).toHaveBeenCalledWith(undefined);
    });
  });

  it('shows a failed state after copying fails', async () => {
    copyLink.mockResolvedValue(false);
    renderHeader(undefined, '/d/docs/spec.md');

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(
      await screen.findByRole('button', { name: /failed/i }),
    ).toBeInTheDocument();
  });
});
