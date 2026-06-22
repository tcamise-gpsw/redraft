// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
  }),
}));

import { Header } from '../Header';

function renderHeader(rateLimit?: Parameters<typeof Header>[0]['rateLimit']) {
  return render(
    <MemoryRouter>
      <Header rateLimit={rateLimit} />
    </MemoryRouter>,
  );
}

describe('Header', () => {
  it('displays remaining quota count prominently', () => {
    renderHeader({ remaining: 4750, limit: 5000, reset: new Date() });

    expect(screen.getByText(/4750/u)).toBeInTheDocument();
  });

  it('label text explicitly says "remaining" so the number is unambiguous', () => {
    renderHeader({ remaining: 3200, limit: 5000, reset: new Date() });

    const label = screen.getByText(/remaining/iu);
    expect(label).toBeInTheDocument();
    expect(label.textContent).toMatch(/3200/u);
  });

  it('shows amber warning when fewer than 100 calls remain', () => {
    renderHeader({ remaining: 42, limit: 5000, reset: new Date() });

    const label = screen.getByText(/remaining/iu);
    expect(label).toHaveClass('text-amber-300');
  });

  it('does not show amber styling when plenty of quota remains', () => {
    renderHeader({ remaining: 4999, limit: 5000, reset: new Date() });

    const label = screen.getByText(/remaining/iu);
    expect(label).not.toHaveClass('text-amber-300');
  });

  it('shows zero remaining / zero limit when no rateLimit is provided', () => {
    renderHeader(undefined);

    expect(screen.getByText(/remaining/iu)).toBeInTheDocument();
    expect(screen.getByText(/0/u)).toBeInTheDocument();
  });
});
