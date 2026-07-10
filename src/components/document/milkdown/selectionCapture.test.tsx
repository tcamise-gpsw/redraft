// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import type { Editor } from '@milkdown/kit/core';
import { describe, expect, it, vi } from 'vitest';

import { useSelectionCapture } from './selectionCapture';

interface FakeEditorView {
  dom: HTMLDivElement;
  state: {
    selection: {
      empty: boolean;
      from: number;
      to: number;
    };
    doc: {
      content: {
        size: number;
      };
      textBetween: (
        from: number,
        to: number,
        blockSeparator?: string,
        leafText?: string,
      ) => string;
    };
  };
  coordsAtPos: (pos: number) => { left: number; top: number; bottom: number };
}

interface SelectionRange {
  from: number;
  to: number;
}

interface HookHarnessProps {
  editorGetter: () => Editor | undefined;
  loading: boolean;
  onTextSelect?: (selection: {
    quote: string;
    context: { prefix: string; suffix: string };
    coords: { left: number; top: number; bottom: number };
    offset: number;
  }) => void;
}

function HookHarness({
  editorGetter,
  loading,
  onTextSelect,
}: HookHarnessProps) {
  useSelectionCapture(editorGetter, loading, onTextSelect);
  return null;
}

function createFakeEditor(text: string, selection: SelectionRange) {
  const dom = document.createElement('div');
  document.body.append(dom);

  const view: FakeEditorView = {
    dom,
    state: {
      selection: {
        empty: selection.from === selection.to,
        from: selection.from,
        to: selection.to,
      },
      doc: {
        content: {
          size: text.length + 2,
        },
        textBetween(from, to) {
          const start = Math.max(0, from - 1);
          const end = Math.max(start, to - 1);
          return text.slice(start, end);
        },
      },
    },
    coordsAtPos: vi.fn().mockReturnValue({
      left: 120,
      top: 64,
      bottom: 92,
    }),
  };

  const editor = {
    action<T>(callback: (ctx: { get: () => FakeEditorView }) => T): T {
      return callback({ get: () => view });
    },
  } as unknown as Editor;

  return {
    dom,
    editor,
    view,
  };
}

describe('useSelectionCapture', () => {
  it('fires onTextSelect with quote, context, and coordinates for a non-empty selection', () => {
    const onTextSelect = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 7,
      to: 11,
    });

    render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onTextSelect).toHaveBeenCalledWith({
      quote: 'Beta',
      context: {
        prefix: 'Alpha ',
        suffix: ' Gamma',
      },
      coords: {
        left: 120,
        top: 64,
        bottom: 92,
      },
      offset: 6,
    });
  });
  it('subtracts snapped prefix characters from the emitted offset', () => {
    const onTextSelect = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 8,
      to: 11,
    });

    render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onTextSelect).toHaveBeenCalledWith({
      quote: 'Beta',
      context: {
        prefix: 'Alpha ',
        suffix: ' Gamma',
      },
      coords: {
        left: 120,
        top: 64,
        bottom: 92,
      },
      offset: 6,
    });
  });

  it('does not fire when the selection is empty', () => {
    const onTextSelect = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 7,
      to: 7,
    });

    render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onTextSelect).not.toHaveBeenCalled();
  });

  it('returns an empty prefix when the selection starts at the document boundary', () => {
    const onTextSelect = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 1,
      to: 6,
    });

    render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onTextSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          prefix: '',
        }),
      }),
    );
  });

  it('returns an empty suffix when the selection ends at the document boundary', () => {
    const onTextSelect = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 12,
      to: 17,
    });

    render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onTextSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          suffix: '',
        }),
      }),
    );
  });

  it('uses the latest callback without reattaching the mouseup listener', () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 7,
      to: 11,
    });

    const { rerender } = render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={firstCallback}
      />,
    );

    rerender(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={secondCallback}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('removes the mouseup listener on unmount', () => {
    const onTextSelect = vi.fn();
    const { dom, editor } = createFakeEditor('Alpha Beta Gamma', {
      from: 7,
      to: 11,
    });

    const { unmount } = render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    unmount();

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onTextSelect).not.toHaveBeenCalled();
  });

  it('passes leafText to textBetween so inline breaks become spaces', () => {
    const onTextSelect = vi.fn();
    // Simulate a doc where position 12 is a hardBreak (nodeSize=1).
    // Without leafText, textBetween would drop it; with leafText=' ', it becomes a space.
    const textWithBreak = 'focusing on consistency';
    const dom = document.createElement('div');
    document.body.append(dom);

    const textBetweenSpy = vi.fn(
      (from: number, to: number, _blockSep?: string, leafText?: string) => {
        const start = Math.max(0, from - 1);
        const end = Math.max(start, to - 1);
        // When leafText is passed, include the space for the hardbreak at position 12
        if (leafText) {
          return textWithBreak.slice(start, end);
        }
        // Without leafText, drop the space at index 11 (simulates missing hardbreak char)
        const raw = textWithBreak.slice(start, end);
        return raw.replace('on c', 'onc');
      },
    );

    const view = {
      dom,
      state: {
        selection: { empty: false, from: 1, to: textWithBreak.length + 1 },
        doc: {
          content: { size: textWithBreak.length + 2 },
          textBetween: textBetweenSpy,
        },
      },
      coordsAtPos: vi.fn().mockReturnValue({ left: 0, top: 0, bottom: 20 }),
    };

    const editor = {
      action(callback: (ctx: { get: () => typeof view }) => unknown) {
        return callback({ get: () => view });
      },
    } as unknown as Editor;

    render(
      <HookHarness
        editorGetter={() => editor}
        loading={false}
        onTextSelect={onTextSelect}
      />,
    );

    act(() => {
      dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    // The quote should contain the space (leafText was passed)
    expect(onTextSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        quote: expect.stringContaining('on c'),
      }),
    );
    // Verify textBetween was called with leafText=' '
    expect(textBetweenSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      ' ',
      ' ',
    );
  });
});
