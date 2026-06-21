// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const emittedSelection = {
  quote: 'Selected text',
  context: { prefix: 'Before ', suffix: ' after' },
  coords: { left: 40, top: 80, bottom: 120 },
};

vi.mock('./milkdown/CrepeEditor', () => ({
  CrepeEditor: ({
    content,
    onMarkdownChange,
    onTextSelect,
    readOnly,
  }: {
    content: string;
    onMarkdownChange?: (markdown: string) => void;
    onTextSelect?: (selection: typeof emittedSelection) => void;
    readOnly: boolean;
  }) => (
    <div data-testid="mock-crepe-editor" data-readonly={String(readOnly)}>
      <div>{content}</div>
      <button
        onClick={() => onMarkdownChange?.('## Edited in WYSIWYG')}
        type="button"
      >
        Mutate WYSIWYG
      </button>
      <button onClick={() => onTextSelect?.(emittedSelection)} type="button">
        Select text
      </button>
    </div>
  ),
}));

import { MilkdownDocument } from './MilkdownDocument';

describe('MilkdownDocument', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
  });

  it('switches between view, wysiwyg, and raw modes', () => {
    render(
      <MilkdownDocument
        content="# Proposal"
        comments={[]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('mock-crepe-editor')).toHaveAttribute(
      'data-readonly',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'WYSIWYG' }));
    expect(screen.getByTestId('mock-crepe-editor')).toHaveAttribute(
      'data-readonly',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(screen.getByLabelText(/markdown editor/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByTestId('mock-crepe-editor')).toHaveAttribute(
      'data-readonly',
      'true',
    );
  });

  it('saves the current wysiwyg markdown', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MilkdownDocument
        content="# Proposal"
        comments={[]}
        onSave={onSave}
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'WYSIWYG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mutate WYSIWYG' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(onSave).toHaveBeenCalledWith('## Edited in WYSIWYG');
  });

  it('saves raw markdown from the textarea editor', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MilkdownDocument
        content="# Proposal"
        comments={[]}
        onSave={onSave}
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    fireEvent.change(screen.getByLabelText(/markdown editor/i), {
      target: { value: '# Proposal\n\nRaw edit' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(onSave).toHaveBeenCalledWith('# Proposal\n\nRaw edit');
  });

  it('confirms before leaving a dirty mode', () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);

    render(
      <MilkdownDocument
        content="# Proposal"
        comments={[]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    fireEvent.change(screen.getByLabelText(/markdown editor/i), {
      target: { value: '# Proposal\n\nRaw edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Discard?');
    expect(screen.getByLabelText(/markdown editor/i)).toBeInTheDocument();
  });

  it('shows the save button only in wysiwyg mode', () => {
    render(
      <MilkdownDocument
        content="# Proposal"
        comments={[]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onSelectComment={vi.fn()}
        onTextSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'WYSIWYG' }));

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows a selection popover and confirms the selected text', () => {
    const onTextSelect = vi.fn();

    render(
      <MilkdownDocument
        content="# Proposal"
        comments={[]}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onSelectComment={vi.fn()}
        onTextSelect={onTextSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(onTextSelect).toHaveBeenCalledWith(emittedSelection);
  });
});
