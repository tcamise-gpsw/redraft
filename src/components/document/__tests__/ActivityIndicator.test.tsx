// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ActivityIndicator } from '../ActivityIndicator';

const FIXED_NOW = new Date('2026-06-21T12:00:00Z').getTime();

const commit = {
  author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
  message: 'Add document',
  date: '',
};

function renderAt(date: string) {
  render(<ActivityIndicator commit={{ ...commit, date }} />);
}

describe('ActivityIndicator', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders null when commit is null', () => {
    const { container } = render(<ActivityIndicator commit={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "just now" for a commit less than 30 seconds ago', () => {
    renderAt(new Date(FIXED_NOW - 20_000).toISOString()); // 20s ago → rounds to 0 min
    expect(screen.getByText(/just now/)).toBeInTheDocument();
  });

  it('shows minutes for commits under one hour', () => {
    renderAt(new Date(FIXED_NOW - 5 * 60_000).toISOString()); // 5 min ago
    expect(screen.getByText(/5 minutes ago/)).toBeInTheDocument();
  });

  it('shows singular "minute" for exactly 1 minute ago', () => {
    renderAt(new Date(FIXED_NOW - 60_000).toISOString());
    expect(screen.getByText(/1 minute ago/)).toBeInTheDocument();
  });

  it('shows hours for commits over one hour old', () => {
    renderAt(new Date(FIXED_NOW - 2 * 3_600_000).toISOString()); // 2h ago
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
  });

  it('shows singular "hour" for exactly 1 hour ago', () => {
    renderAt(new Date(FIXED_NOW - 3_600_000).toISOString());
    expect(screen.getByText(/1 hour ago/)).toBeInTheDocument();
  });

  it('shows days for commits over one day old', () => {
    renderAt(new Date(FIXED_NOW - 3 * 86_400_000).toISOString()); // 3d ago
    expect(screen.getByText(/3 days ago/)).toBeInTheDocument();
  });

  it('shows the commit message and author login', () => {
    renderAt(new Date(FIXED_NOW - 3_600_000).toISOString());
    expect(screen.getByText(/Add document/)).toBeInTheDocument();
    expect(screen.getByText(/@jdoe/)).toBeInTheDocument();
  });
});
