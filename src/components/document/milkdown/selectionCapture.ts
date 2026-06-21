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

      const quote = doc.textBetween(selection.from, selection.to, ' ').trim();
      if (!quote) {
        return;
      }

      const prefix = doc.textBetween(
        Math.max(0, selection.from - 100),
        selection.from,
        ' ',
      );
      const suffix = doc.textBetween(
        selection.to,
        Math.min(doc.content.size, selection.to + 100),
        ' ',
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
