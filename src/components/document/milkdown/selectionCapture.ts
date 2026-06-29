import { useEffect, useRef } from 'react';

import { editorViewCtx, type Editor } from '@milkdown/kit/core';
import type { EditorView } from '@milkdown/kit/prose/view';

export interface TextSelection {
  quote: string;
  context: {
    prefix: string;
    suffix: string;
  };
  coords: {
    left: number;
    top: number;
    bottom: number;
  };
}

function getEditorView(
  editorGetter: () => Editor | undefined,
): EditorView | undefined {
  const editor = editorGetter();

  if (!editor) {
    return undefined;
  }

  try {
    return editor.action((ctx) => ctx.get(editorViewCtx));
  } catch {
    return undefined;
  }
}

/**
 * Expands a selection that starts or ends mid-word to the nearest word boundary.
 * A word character is \w (letter, digit, underscore).
 */
export function snapToWordBoundaries(
  prefix: string,
  quote: string,
  suffix: string,
): { quote: string; prefix: string; suffix: string } {
  let snappedQuote = quote;
  let snappedPrefix = prefix;
  let snappedSuffix = suffix;

  // Snap start: if prefix ends with a word-char AND quote starts with a word-char,
  // the selection started mid-word — pull the trailing word fragment from prefix.
  const leadFragment = snappedPrefix.match(/(\w+)$/);
  if (leadFragment && /^\w/.test(snappedQuote)) {
    snappedQuote = leadFragment[1] + snappedQuote;
    snappedPrefix = snappedPrefix.slice(
      0,
      snappedPrefix.length - leadFragment[1].length,
    );
  }

  // Snap end: if quote ends with a word-char AND suffix starts with a word-char,
  // the selection ended mid-word — pull the leading word fragment from suffix.
  const trailFragment = snappedSuffix.match(/^(\w+)/);
  if (trailFragment && /\w$/.test(snappedQuote)) {
    snappedQuote = snappedQuote + trailFragment[1];
    snappedSuffix = snappedSuffix.slice(trailFragment[1].length);
  }

  return { quote: snappedQuote, prefix: snappedPrefix, suffix: snappedSuffix };
}

export function useSelectionCapture(
  editorGetter: () => Editor | undefined,
  loading: boolean,
  onTextSelect: ((selection: TextSelection) => void) | undefined,
): void {
  const callbackRef = useRef(onTextSelect);

  useEffect(() => {
    callbackRef.current = onTextSelect;
  }, [onTextSelect]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    const view = getEditorView(editorGetter);
    if (!view) {
      return undefined;
    }

    const handleMouseUp = () => {
      const callback = callbackRef.current;
      if (!callback) {
        return;
      }

      const { doc, selection } = view.state;
      if (selection.empty) {
        return;
      }

      const rawQuote = doc
        .textBetween(selection.from, selection.to, ' ')
        .trim();
      if (!rawQuote) {
        return;
      }

      const rawPrefix = doc.textBetween(
        Math.max(0, selection.from - 100),
        selection.from,
        ' ',
      );
      const rawSuffix = doc.textBetween(
        selection.to,
        Math.min(doc.content.size, selection.to + 100),
        ' ',
      );
      const { quote, prefix, suffix } = snapToWordBoundaries(
        rawPrefix,
        rawQuote,
        rawSuffix,
      );
      const coords = view.coordsAtPos(selection.from);

      callback({
        quote,
        context: {
          prefix,
          suffix,
        },
        coords: {
          left: coords.left,
          top: coords.top,
          bottom: coords.bottom,
        },
      });
    };

    view.dom.addEventListener('mouseup', handleMouseUp);

    return () => {
      view.dom.removeEventListener('mouseup', handleMouseUp);
    };
  }, [editorGetter, loading]);
}
