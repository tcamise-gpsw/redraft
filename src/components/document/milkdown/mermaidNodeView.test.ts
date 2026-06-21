// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  codeBlockSchemaNode,
  defaultNodeView,
  defaultNodeViewFactory,
  mockMermaidRender,
} = vi.hoisted(() => {
  const fallbackDom = document.createElement('pre');
  fallbackDom.textContent = 'fallback';
  const fallbackView = { dom: fallbackDom };

  return {
    codeBlockSchemaNode: { id: 'code_block' },
    defaultNodeView: fallbackView,
    defaultNodeViewFactory: vi.fn(() => fallbackView),
    mockMermaidRender: vi.fn(async (_id: string, definition: string) => {
      if (definition === 'bad syntax') {
        throw new Error('Parse error');
      }

      return { svg: `<svg data-definition="${definition}"></svg>` };
    }),
  };
});

vi.mock('@milkdown/utils', () => ({
  $view: (type: unknown, view: unknown) => ({ type, view }),
}));

vi.mock('@milkdown/preset-commonmark', () => ({
  codeBlockSchema: {
    node: codeBlockSchemaNode,
  },
}));

vi.mock('@milkdown/components/code-block', () => ({
  codeBlockView: {
    view: defaultNodeViewFactory,
  },
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: mockMermaidRender,
  },
}));

import { mermaidNodeViewPlugin } from './mermaidNodeView';

interface MermaidNodeView {
  dom: HTMLElement;
  update: (node: {
    attrs: { language: string };
    textContent: string;
    type: { name: string };
  }) => boolean;
  destroy: () => void;
  ignoreMutation: () => boolean;
}

interface MermaidNodeViewConstructor {
  (
    node: {
      attrs: { language: string };
      textContent: string;
      type: { name: string };
    },
    view: unknown,
    getPos: () => number,
  ): MermaidNodeView;
}

interface MermaidViewPlugin {
  view: (ctx: unknown) => MermaidNodeViewConstructor;
}

function getConstructor() {
  const plugin = mermaidNodeViewPlugin() as unknown as MermaidViewPlugin;
  return plugin.view({});
}

describe('mermaidNodeViewPlugin', () => {
  beforeEach(() => {
    defaultNodeViewFactory.mockClear();
    mockMermaidRender.mockClear();
  });

  it('renders mermaid code blocks as svg', async () => {
    const constructor = getConstructor();
    const nodeView = constructor(
      {
        attrs: { language: 'mermaid' },
        textContent: 'graph TD; A-->B',
        type: { name: 'code_block' },
      },
      {},
      () => 0,
    );

    await waitFor(() => {
      expect(nodeView.dom.innerHTML).toContain('<svg');
    });

    expect(nodeView.dom.innerHTML).toContain('graph TD; A-->B');
  });

  it('shows an error state when mermaid rendering fails', async () => {
    const constructor = getConstructor();
    const nodeView = constructor(
      {
        attrs: { language: 'mermaid' },
        textContent: 'bad syntax',
        type: { name: 'code_block' },
      },
      {},
      () => 0,
    );

    await waitFor(() => {
      expect(nodeView.dom.textContent).toContain('Parse error');
    });

    expect(nodeView.dom.querySelector('pre')?.textContent).toContain(
      'bad syntax',
    );
  });

  it('leaves non-mermaid code blocks on the default code block node view', () => {
    const constructor = getConstructor();
    const nodeView = constructor(
      {
        attrs: { language: 'typescript' },
        textContent: 'const value = 1;',
        type: { name: 'code_block' },
      },
      {},
      () => 0,
    );

    expect(nodeView).toBe(defaultNodeView);
    expect(defaultNodeViewFactory).toHaveBeenCalled();
    expect(mockMermaidRender).not.toHaveBeenCalled();
  });

  it('update re-renders when mermaid content changes', async () => {
    const nodeType = { name: 'code_block' };
    const constructor = getConstructor();
    const nodeView = constructor(
      { attrs: { language: 'mermaid' }, textContent: 'graph TD; A-->B', type: nodeType },
      {},
      () => 0,
    );

    await waitFor(() => {
      expect(nodeView.dom.innerHTML).toContain('<svg');
    });

    const accepted = nodeView.update({
      attrs: { language: 'mermaid' },
      textContent: 'graph TD; C-->D',
      type: nodeType, // same reference — ProseMirror NodeType is a singleton
    });

    expect(accepted).toBe(true);
    await waitFor(() => {
      expect(nodeView.dom.innerHTML).toContain('C-->D');
    });
  });

  it('update returns false when the node type differs', () => {
    const nodeType = { name: 'code_block' };
    const otherType = { name: 'other_block' };
    const constructor = getConstructor();
    const nodeView = constructor(
      { attrs: { language: 'mermaid' }, textContent: 'graph TD; A-->B', type: nodeType },
      {},
      () => 0,
    );

    const accepted = nodeView.update({
      attrs: { language: 'mermaid' },
      textContent: 'graph TD; C-->D',
      type: otherType, // different reference → rejected
    });

    expect(accepted).toBe(false);
  });

  it('update returns false when language changes to non-mermaid', () => {
    const nodeType = { name: 'code_block' };
    const constructor = getConstructor();
    const nodeView = constructor(
      { attrs: { language: 'mermaid' }, textContent: 'graph TD; A-->B', type: nodeType },
      {},
      () => 0,
    );

    const accepted = nodeView.update({
      attrs: { language: 'typescript' },
      textContent: 'const x = 1;',
      type: nodeType, // same reference but language changed
    });

    expect(accepted).toBe(false);
  });

  it('destroy prevents a pending render from committing to the DOM', async () => {
    let resolveRender!: (result: { svg: string }) => void;
    mockMermaidRender.mockImplementationOnce(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          resolveRender = resolve;
        }),
    );

    const constructor = getConstructor();
    const nodeView = constructor(
      {
        attrs: { language: 'mermaid' },
        textContent: 'graph TD; A-->B',
        type: { name: 'code_block' },
      },
      {},
      () => 0,
    );

    nodeView.destroy();
    resolveRender({ svg: '<svg>ghost</svg>' });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(nodeView.dom.innerHTML).not.toContain('ghost');
  });

  it('ignoreMutation returns true to prevent ProseMirror from replacing the view', () => {
    const constructor = getConstructor();
    const nodeView = constructor(
      {
        attrs: { language: 'mermaid' },
        textContent: 'graph TD; A-->B',
        type: { name: 'code_block' },
      },
      {},
      () => 0,
    );

    expect(nodeView.ignoreMutation()).toBe(true);
  });
});
