// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { Schema } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import { DecorationSet, EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commentPluginKey,
  makeCommentPlugin,
  type CommentHighlight,
} from './commentPlugin';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br'];
      },
    },
    text: { group: 'inline' },
  },
  marks: {
    strong: {
      parseDOM: [{ tag: 'strong' }],
      toDOM() {
        return ['strong', 0];
      },
    },
    link: {
      attrs: { href: {} },
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(dom) {
            return { href: (dom as HTMLElement).getAttribute('href') ?? '' };
          },
        },
      ],
      toDOM(node) {
        return ['a', { href: node.attrs.href }, 0];
      },
    },
  },
});

function createParagraphState(
  content: Parameters<(typeof schema)['node']>[2],
  comments: CommentHighlight[],
  onSelectComment = vi.fn(),
) {
  return EditorState.create({
    schema,
    doc: schema.node('doc', undefined, [
      schema.node('paragraph', undefined, content),
    ]),
    plugins: [makeCommentPlugin(comments, onSelectComment)],
  });
}

function getDecorations(state: EditorState): DecorationSet {
  return commentPluginKey.getState(state) ?? DecorationSet.empty;
}

describe('commentPlugin', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates an inline decoration for a quote within one text node', () => {
    const state = createParagraphState(
      [schema.text('Alpha Beta Gamma')],
      [{ id: 'comment-1', quote: 'Beta' }],
    );

    const decorations = getDecorations(state).find();

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(7);
    expect(decorations[0]?.to).toBe(11);
  });

  it('creates one decoration when a quote spans marked text boundaries', () => {
    const state = createParagraphState(
      [
        schema.text('Alpha '),
        schema.text('Beta', [schema.mark('strong')]),
        schema.text(' '),
        schema.text('Gamma', [schema.mark('link', { href: '#diagram' })]),
      ],
      [{ id: 'comment-1', quote: 'Beta Gamma' }],
    );

    const decorations = getDecorations(state).find();

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(7);
    expect(decorations[0]?.to).toBe(17);
  });

  it('creates a decoration when a quote spans a hard_break node', () => {
    const state = createParagraphState(
      [
        schema.text('focusing on'),
        schema.nodes.hard_break.create(),
        schema.text('consistency and versioning'),
      ],
      [{ id: 'comment-1', quote: 'on consistency' }],
    );

    const decorations = getDecorations(state).find();

    expect(decorations).toHaveLength(1);
    // doc(0) p(1) "focusing on"(2..12) hard_break(13) "consistency..."(14...)
    // text index: "focusing on consistency and versioning"
    // "on" at char 9..10, space at char 11, "consistency" at char 12..22
    // quote "on consistency" = chars 9..23, mapped to pos 10..25
    expect(decorations[0]?.from).toBe(10);
    expect(decorations[0]?.to).toBe(24);
  });

  it('skips decorations when a quote is not present in the document', () => {
    const state = createParagraphState(
      [schema.text('Alpha Beta Gamma')],
      [{ id: 'comment-1', quote: 'Delta' }],
    );

    expect(getDecorations(state).find()).toHaveLength(0);
  });

  it('rebuilds decorations when comment metadata is dispatched', () => {
    const state = createParagraphState(
      [schema.text('Alpha Beta Gamma')],
      [{ id: 'comment-1', quote: 'Beta' }],
    );

    const nextState = state.apply(
      state.tr.setMeta(commentPluginKey, [{ id: 'comment-2', quote: 'Gamma' }]),
    );
    const decorations = getDecorations(nextState).find();

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(12);
    expect(decorations[0]?.to).toBe(17);
  });

  it('maps decorations through document changes', () => {
    const state = createParagraphState(
      [schema.text('Alpha Beta Gamma')],
      [{ id: 'comment-1', quote: 'Beta' }],
    );

    const nextState = state.apply(state.tr.insertText('new ', 7));
    const decorations = getDecorations(nextState).find();

    expect(decorations).toHaveLength(1);
    expect(decorations[0]?.from).toBe(11);
    expect(decorations[0]?.to).toBe(15);
  });

  it('fires onSelectComment when a highlighted decoration is clicked', () => {
    const onSelectComment = vi.fn();
    const state = createParagraphState(
      [schema.text('Alpha Beta Gamma')],
      [{ id: 'comment-1', quote: 'Beta' }],
      onSelectComment,
    );

    const view = new EditorView(document.body, { state });
    const highlight = view.dom.querySelector('[data-comment-id="comment-1"]');
    let handled = false;

    expect(highlight).not.toBeNull();

    view.someProp('handleClick', (handler) => {
      handled = handler(view, 0, { target: highlight } as MouseEvent) === true;
      return true;
    });

    expect(handled).toBe(true);
    expect(onSelectComment).toHaveBeenCalledWith('comment-1');

    view.destroy();
  });
});
