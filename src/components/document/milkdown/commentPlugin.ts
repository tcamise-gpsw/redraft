import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

export interface CommentHighlight {
  id: string;
  quote: string;
}

export const commentPluginKey = new PluginKey<DecorationSet>(
  'MILKDOWN_COMMENT_HIGHLIGHTS',
);

interface TextSpan {
  charFrom: number;
  charTo: number;
  posFrom: number;
  posTo: number;
}

interface TextIndex {
  text: string;
  spans: TextSpan[];
}

function buildTextIndex(doc: ProseMirrorNode): TextIndex {
  const parts: string[] = [];
  const spans: TextSpan[] = [];
  let charOffset = 0;

  const appendText = (value: string, posFrom: number) => {
    if (!value) {
      return false;
    }

    parts.push(value);
    spans.push({
      charFrom: charOffset,
      charTo: charOffset + value.length,
      posFrom,
      posTo: posFrom + value.length,
    });
    charOffset += value.length;
    return true;
  };

  const appendSeparator = () => {
    parts.push(' ');
    charOffset += 1;
  };

  const visit = (node: ProseMirrorNode, basePos: number) => {
    let emittedChildText = false;
    let offset = 0;

    node.forEach((child) => {
      const childPos = basePos + offset + 1;

      if (child.isBlock && emittedChildText) {
        appendSeparator();
      }

      let emittedFromChild = false;

      if (child.isText) {
        emittedFromChild = appendText(child.text ?? '', childPos);
      } else if (child.isLeaf && child.isInline) {
        emittedFromChild = appendText(' ', childPos);
      } else {
        emittedFromChild = visit(child, childPos);
      }

      emittedChildText = emittedChildText || emittedFromChild;
      offset += child.nodeSize;
    });

    return emittedChildText;
  };

  visit(doc, -1);

  return {
    text: parts.join(''),
    spans,
  };
}

function resolvePosition(
  spans: TextSpan[],
  charOffset: number,
  side: 'start' | 'end',
): number | null {
  for (const span of spans) {
    if (charOffset >= span.charFrom && charOffset < span.charTo) {
      return span.posFrom + (charOffset - span.charFrom);
    }

    if (side === 'end' && charOffset === span.charTo) {
      return span.posTo;
    }
  }

  return null;
}

function buildDecorations(
  doc: ProseMirrorNode,
  comments: CommentHighlight[],
): DecorationSet {
  const { text, spans } = buildTextIndex(doc);
  const decorations: Decoration[] = [];

  for (const comment of comments) {
    const quote = comment.quote.trim();
    if (!quote) {
      continue;
    }

    const charFrom = text.indexOf(quote);
    if (charFrom === -1) {
      continue;
    }

    const charTo = charFrom + quote.length;
    const from = resolvePosition(spans, charFrom, 'start');
    const to = resolvePosition(spans, charTo, 'end');

    if (from == null || to == null || from >= to) {
      continue;
    }

    decorations.push(
      Decoration.inline(from, to, {
        class: 'milkdown-comment-highlight',
        'data-comment-id': comment.id,
      }),
    );
  }

  return DecorationSet.create(doc, decorations);
}

export function makeCommentPlugin(
  initialComments: CommentHighlight[],
  onSelectComment: (id: string) => void,
): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: commentPluginKey,
    state: {
      init(_config, state) {
        return buildDecorations(state.doc, initialComments);
      },
      apply(tr, decorations, _oldState, newState) {
        const nextComments = tr.getMeta(commentPluginKey) as
          | CommentHighlight[]
          | undefined;

        if (nextComments) {
          return buildDecorations(newState.doc, nextComments);
        }

        if (tr.docChanged) {
          return decorations.map(tr.mapping, tr.doc);
        }

        return decorations;
      },
    },
    props: {
      decorations(state) {
        return commentPluginKey.getState(state) ?? DecorationSet.empty;
      },
      handleClick(_view, _pos, event) {
        const commentId = (event.target as HTMLElement | null)
          ?.closest('[data-comment-id]')
          ?.getAttribute('data-comment-id');

        if (!commentId) {
          return false;
        }

        onSelectComment(commentId);
        return true;
      },
    },
  });
}
