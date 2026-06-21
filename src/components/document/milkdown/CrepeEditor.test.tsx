// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { Milkdown, MilkdownProvider } from '@milkdown/react';
import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CrepeEditor, useCrepeInstance } from './CrepeEditor';
import type { CrepeEditorHandle } from './CrepeEditor';

const {
  commentPluginKey,
  createdInstances,
  editorViewCtx,
  FakeCrepe,
  mockMakeCommentPlugin,
  mockReplaceAll,
  mockUseSelectionCapture,
} = vi.hoisted(() => {
  const hoistedEditorViewCtx = Symbol('editorViewCtx');

  class HoistedFakeEditor {
    status = 'Idle';
    readonly view = {
      dom: document.createElement('div'),
      state: {
        tr: {
          setMeta: (_key: unknown, meta: unknown) => ({ meta }),
        },
      },
      dispatch: vi.fn((transaction: unknown) => {
        this.dispatchedTransactions.push(transaction);
      }),
      setProps: vi.fn(),
    };
    readonly plugins: unknown[] = [];
    readonly dispatchedTransactions: unknown[] = [];
    readonly replaceAllCalls: string[] = [];

    use(plugin: unknown) {
      this.plugins.push(plugin);
      return this;
    }

    action<T>(
      callback: (ctx: {
        get: (key: unknown) => unknown;
        replaceAllTarget: HoistedFakeEditor;
      }) => T,
    ): T {
      return callback({
        get: (key) => {
          if (key === hoistedEditorViewCtx) {
            return this.view;
          }

          return undefined;
        },
        replaceAllTarget: this,
      });
    }

    applyReplaceAll(markdown: string) {
      this.replaceAllCalls.push(markdown);
    }
  }

  const fakeInstances: HoistedFakeCrepe[] = [];

  class HoistedFakeCrepe {
    readonly editor = new HoistedFakeEditor();
    readonly markdownListeners: Array<
      (_ctx: unknown, markdown: string, prevMarkdown: string) => void
    > = [];
    readonly setReadonlyCalls: boolean[] = [];
    root: HTMLElement;
    markdown: string;
    readonlyState = false;

    constructor({ root, defaultValue = '' }: { root: HTMLElement; defaultValue?: string }) {
      this.root = root;
      this.markdown = defaultValue;
      fakeInstances.push(this);
    }

    create = vi.fn(async () => {
      this.editor.status = 'Created';
      this.editor.view.dom.textContent = this.markdown;
      this.editor.view.dom.setAttribute('contenteditable', String(!this.readonlyState));
      this.root.replaceChildren(this.editor.view.dom);
      return this.editor;
    });

    destroy = vi.fn(async () => {
      this.editor.status = 'Destroyed';
    });

    setReadonly = vi.fn((value: boolean) => {
      this.readonlyState = value;
      this.setReadonlyCalls.push(value);
      this.editor.view.dom.setAttribute('contenteditable', String(!value));
      return this;
    });

    getMarkdown = vi.fn(() => this.markdown);

    on = vi.fn(
      (
        register: (api: {
          markdownUpdated: typeof HoistedFakeCrepe.prototype.markdownUpdated;
        }) => void,
      ) => {
        register({ markdownUpdated: this.markdownUpdated });
        return this;
      },
    );

    markdownUpdated = (
      callback: (_ctx: unknown, markdown: string, prevMarkdown: string) => void,
    ) => {
      this.markdownListeners.push(callback);
      return this;
    };

    emitMarkdown(markdown: string, previousMarkdown = this.markdown) {
      this.markdown = markdown;
      this.editor.view.dom.textContent = markdown;
      this.markdownListeners.forEach((listener) => {
        listener({}, markdown, previousMarkdown);
      });
    }
  }

  return {
    commentPluginKey: { key: 'comment-plugin-key' },
    createdInstances: fakeInstances,
    editorViewCtx: hoistedEditorViewCtx,
    FakeCrepe: HoistedFakeCrepe,
    mockMakeCommentPlugin: vi.fn(() => ({ name: 'comment-plugin' })),
    mockReplaceAll: vi.fn((markdown: string) => {
      return (ctx: { replaceAllTarget: HoistedFakeEditor }) => {
        ctx.replaceAllTarget.applyReplaceAll(markdown);
      };
    }),
    mockUseSelectionCapture: vi.fn(),
  };
});

type FakeCrepeInstance = InstanceType<typeof FakeCrepe>;

vi.mock('@milkdown/crepe', () => ({
  Crepe: FakeCrepe,
}));

vi.mock('@milkdown/kit/core', () => ({
  EditorStatus: {
    Created: 'Created',
  },
  editorViewCtx,
}));

vi.mock('@milkdown/utils', () => ({
  $prose: (factory: unknown) => ({ factory }),
  $view: (type: unknown, view: unknown) => ({ type, view }),
  replaceAll: mockReplaceAll,
}));

vi.mock('./commentPlugin', () => ({
  commentPluginKey,
  makeCommentPlugin: mockMakeCommentPlugin,
}));

vi.mock('./selectionCapture', () => ({
  useSelectionCapture: mockUseSelectionCapture,
}));

interface HookHarnessHandle {
  getMarkdown: () => string;
  getCrepe: () => FakeCrepeInstance | null;
}

interface HookHarnessProps {
  content: string;
  comments: Array<{ id: string; quote: string }>;
  onMarkdownChange?: (markdown: string) => void;
  onSelectComment?: (id: string) => void;
  onTextSelect?: (selection: {
    quote: string;
    context: { prefix: string; suffix: string };
    coords: { left: number; top: number; bottom: number };
  }) => void;
  readOnly: boolean;
}

const HookHarness = forwardRef<HookHarnessHandle, HookHarnessProps>(
  function HookHarness(
    { content, comments, onMarkdownChange, onSelectComment, onTextSelect, readOnly },
    ref,
  ) {
    const { crepeRef, getMarkdown } = useCrepeInstance({
      content,
      comments,
      onMarkdownChange,
      onSelectComment,
      onTextSelect,
      readOnly,
    });

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown,
        getCrepe: () => crepeRef.current as FakeCrepeInstance | null,
      }),
      [crepeRef, getMarkdown],
    );

    return <Milkdown />;
  },
);

function renderHookHarness(
  props: HookHarnessProps,
  ref: { current: HookHarnessHandle | null },
) {
  return render(
    <MilkdownProvider>
      <HookHarness ref={ref} {...props} />
    </MilkdownProvider>,
  );
}

describe('CrepeEditor and useCrepeInstance', () => {
  beforeEach(() => {
    createdInstances.length = 0;
    mockMakeCommentPlugin.mockClear();
    mockReplaceAll.mockClear();
    mockUseSelectionCapture.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders without error with minimal content', async () => {
    render(
      <CrepeEditor content="# Heading" readOnly={true} comments={[]} />,
    );

    await waitFor(() => {
      expect(createdInstances).toHaveLength(1);
    });

    expect(document.querySelector('.milkdown-document-wrapper')).not.toBeNull();
    expect(document.querySelector('[data-milkdown-root]')).not.toBeNull();
  });

  it('renders non-editable content when readOnly is true', async () => {
    render(
      <CrepeEditor content="# Heading" readOnly={true} comments={[]} />,
    );

    await waitFor(() => {
      expect(screen.getByText('# Heading')).toBeInTheDocument();
    });

    expect(document.querySelector('[contenteditable="false"]')).not.toBeNull();
  });

  it('toggles readonly without remounting the editor instance', async () => {
    const { rerender } = render(
      <CrepeEditor content="# Heading" readOnly={true} comments={[]} />,
    );

    await waitFor(() => {
      expect(createdInstances).toHaveLength(1);
    });

    const firstInstance = createdInstances[0];

    rerender(
      <CrepeEditor content="# Heading" readOnly={false} comments={[]} />,
    );

    await waitFor(() => {
      expect(firstInstance?.setReadonly).toHaveBeenCalledWith(false);
    });

    expect(createdInstances).toHaveLength(1);
    expect(createdInstances[0]).toBe(firstInstance);
  });

  it('dispatches comment updates through plugin metadata', async () => {
    const ref = { current: null as HookHarnessHandle | null };
    const { rerender } = renderHookHarness(
      {
        content: '# Heading',
        comments: [{ id: 'comment-1', quote: 'Heading' }],
        readOnly: true,
      },
      ref,
    );

    await waitFor(() => {
      expect(createdInstances).toHaveLength(1);
    });

    rerender(
      <MilkdownProvider>
        <HookHarness
          ref={ref}
          content="# Heading"
          comments={[{ id: 'comment-2', quote: 'Updated' }]}
          readOnly={true}
        />
      </MilkdownProvider>,
    );

    await waitFor(() => {
      expect(createdInstances[0]?.editor.dispatchedTransactions).toContainEqual({
        meta: [{ id: 'comment-2', quote: 'Updated' }],
      });
    });
  });

  it('forwards markdownUpdated events to onMarkdownChange', async () => {
    const onMarkdownChange = vi.fn();
    const ref = { current: null as HookHarnessHandle | null };

    renderHookHarness(
      {
        content: '# Heading',
        comments: [],
        onMarkdownChange,
        readOnly: false,
      },
      ref,
    );

    await waitFor(() => {
      expect(createdInstances).toHaveLength(1);
    });

    createdInstances[0]?.emitMarkdown('## Updated');

    expect(onMarkdownChange).toHaveBeenCalledWith('## Updated');
  });

  it('syncs external content changes in view mode without recreating the editor', async () => {
    const ref = { current: null as HookHarnessHandle | null };
    const { rerender } = renderHookHarness(
      {
        content: '# Before',
        comments: [],
        readOnly: true,
      },
      ref,
    );

    await waitFor(() => {
      expect(createdInstances).toHaveLength(1);
    });

    const instance = createdInstances[0];

    rerender(
      <MilkdownProvider>
        <HookHarness ref={ref} content="# After" comments={[]} readOnly={true} />
      </MilkdownProvider>,
    );

    await waitFor(() => {
      expect(instance?.editor.replaceAllCalls).toContain('# After');
    });

    expect(createdInstances).toHaveLength(1);
  });

  it('returns the current markdown synchronously', async () => {
    const ref = { current: null as HookHarnessHandle | null };

    renderHookHarness(
      {
        content: '# Before',
        comments: [],
        readOnly: false,
      },
      ref,
    );

    await waitFor(() => {
      expect(ref.current).not.toBeNull();
    });

    createdInstances[0]?.emitMarkdown('## Current');

    expect(ref.current?.getMarkdown()).toBe('## Current');
  });

  it('exposes a ref handle from CrepeEditor', async () => {
    const ref = { current: null as CrepeEditorHandle | null };

    render(
      <CrepeEditor
        ref={ref}
        content="# Heading"
        readOnly={false}
        comments={[]}
      />,
    );

    await waitFor(() => {
      expect(ref.current).not.toBeNull();
    });

    expect(ref.current?.getMarkdown()).toBe('# Heading');
  });
});
