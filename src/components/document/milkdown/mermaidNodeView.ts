import type { MilkdownPlugin } from '@milkdown/ctx';
import { codeBlockView } from '@milkdown/components/code-block';
import { codeBlockSchema } from '@milkdown/preset-commonmark';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type {
  Decoration,
  EditorView,
  NodeView,
  NodeViewConstructor,
} from '@milkdown/kit/prose/view';
import { $view } from '@milkdown/utils';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
});

let diagramId = 0;

class MermaidCodeBlockView implements NodeView {
  dom = document.createElement('div');
  private renderToken = 0;
  private node: ProseMirrorNode;

  constructor(node: ProseMirrorNode) {
    this.node = node;
    this.dom.className = 'milkdown-mermaid-block';
    void this.render(node.textContent);
  }

  update(updatedNode: ProseMirrorNode) {
    if (updatedNode.type !== this.node.type) {
      return false;
    }

    if (updatedNode.attrs.language !== 'mermaid') {
      return false;
    }

    this.node = updatedNode;
    void this.render(updatedNode.textContent);
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.renderToken += 1;
  }

  private async render(definition: string) {
    const renderToken = ++this.renderToken;

    try {
      const { svg } = await mermaid.render(
        `milkdown-mermaid-${diagramId++}`,
        definition,
      );

      if (renderToken !== this.renderToken) {
        return;
      }

      this.dom.innerHTML = svg;
    } catch (error) {
      if (renderToken !== this.renderToken) {
        return;
      }

      const fallback = document.createElement('div');
      fallback.className =
        'rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100';

      const preview = document.createElement('pre');
      preview.className =
        'mb-3 overflow-x-auto whitespace-pre-wrap rounded bg-slate-950/70 p-3 text-slate-100';
      preview.textContent = definition;

      const message = document.createElement('p');
      message.textContent =
        error instanceof Error
          ? error.message
          : 'Unable to render mermaid diagram.';

      fallback.replaceChildren(preview, message);
      this.dom.replaceChildren(fallback);
    }
  }
}

export function mermaidNodeViewPlugin(): MilkdownPlugin {
  return $view(codeBlockSchema.node, (): NodeViewConstructor => {
    const defaultConstructor = codeBlockView.view;

    return (
      node: ProseMirrorNode,
      view: EditorView,
      getPos: (() => number | undefined) | boolean,
      decorations: readonly Decoration[],
      innerDecorations,
    ) => {
      if (node.attrs.language !== 'mermaid') {
        const resolvedGetPos =
          typeof getPos === 'function' ? getPos : () => undefined;

        return defaultConstructor(
          node,
          view,
          resolvedGetPos,
          decorations,
          innerDecorations,
        );
      }

      return new MermaidCodeBlockView(node);
    };
  });
}
