// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useToast, ToastProvider } from '../../../hooks/useToast';

function ToastHarness() {
  const { showToast } = useToast();

  return (
    <button type="button" onClick={() => showToast({ tone: 'info', title: 'Saved' })}>
      Trigger toast
    </button>
  );
}

describe('ToastProvider', () => {
  it('shows a toast and auto-dismisses it after five seconds', () => {
    vi.useFakeTimers();

    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger toast/i }));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
