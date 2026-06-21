// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../../App';
import { AppLayout } from '../AppLayout';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function setStoredAuth() {
  localStorage.setItem(
    'proposal-review.auth',
    JSON.stringify({
      pat: 'ghp_test',
      owner: 'acme',
      repo: 'workspace',
      user: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
    }),
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
    window.location.hash = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the three-panel layout at desktop width', () => {
    render(
      <AppLayout
        sidebar={<div>tree</div>}
        main={<div>document</div>}
        aside={<div>comments</div>}
      />,
    );

    expect(screen.getByTestId('app-layout')).toHaveClass('lg:grid');
    expect(screen.getByTestId('app-layout-sidebar')).toHaveTextContent('tree');
    expect(screen.getByTestId('app-layout-main')).toHaveTextContent('document');
    expect(screen.getByTestId('app-layout-aside')).toHaveTextContent(
      'comments',
    );
  });

  it('routes to ProposalView for hash proposal paths', () => {
    setStoredAuth();
    window.location.hash = '#/proposals/test';

    render(<App />);

    expect(screen.getByText('Loading proposal…')).toBeInTheDocument();
  });

  it('routes to Settings for the settings hash path', () => {
    setStoredAuth();
    window.location.hash = '#/settings';

    render(<App />);

    expect(
      screen.getByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/@jdoe/i).length).toBeGreaterThan(0);
  });
});
