import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { Crepe } from '@milkdown/crepe';
import { editorViewCtx, type Editor } from '@milkdown/kit/core';
import type { UseEditorReturn } from '@milkdown/react';
import { useEditor } from '@milkdown/react';
import { $prose, replaceAll } from '@milkdown/utils';

import {
  commentPluginKey,
  makeCommentPlugin,
  type CommentHighlight,
} from './commentPlugin';
import { useSelectionCapture, type TextSelection } from './selectionCapture';
import { mermaidNodeViewPlugin } from './mermaidNodeView';

export interface UseCrepeInstanceOptions {
  content: string;
  comments: CommentHighlight[];
  onTextSelect?: (selection: TextSelection) => void;
  onSelectComment?: (id: string) => void;
  onMarkdownChange?: (markdown: string) => void;
  onRenderedText?: (text: string) => void;
  readOnly: boolean;
}

export interface UseCrepeInstanceResult {
  editorReturn: UseEditorReturn;
  crepeRef: RefObject<Crepe | null>;
  getMarkdown: () => string;
}

export function useCrepeInstance(
  options: UseCrepeInstanceOptions,
): UseCrepeInstanceResult {
  const {
    content,
    comments,
    onTextSelect,
    onSelectComment,
    onMarkdownChange,
    onRenderedText,
    readOnly,
  } = options;
  const crepeRef = useRef<Crepe | null>(null);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const onRenderedTextRef = useRef(onRenderedText);
  const onSelectCommentRef = useRef(onSelectComment);

  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  useEffect(() => {
    onRenderedTextRef.current = onRenderedText;
  }, [onRenderedText]);

  useEffect(() => {
    onSelectCommentRef.current = onSelectComment;
  }, [onSelectComment]);

  const emitRenderedText = useCallback((editor: Editor) => {
    const callback = onRenderedTextRef.current;
    if (!callback) {
      return;
    }

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      callback(
        view.state.doc.textBetween(0, view.state.doc.content.size, ' ', ' '),
      );
    });
  }, []);

  const editorReturn = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: content,
    });

    crepe.setReadonly(readOnly);
    crepe.editor.use(
      $prose(() =>
        makeCommentPlugin(comments, (commentId) => {
          onSelectCommentRef.current?.(commentId);
        }),
      ),
    );
    crepe.editor.use(mermaidNodeViewPlugin());
    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        onMarkdownChangeRef.current?.(markdown);
        emitRenderedText(crepe.editor as Editor);
      });
    });

    crepeRef.current = crepe;

    return crepe;
  }, []);

  useSelectionCapture(
    () => crepeRef.current?.editor as Editor | undefined,
    editorReturn.loading,
    onTextSelect,
  );

  useEffect(() => {
    if (editorReturn.loading) {
      return;
    }

    const editor = crepeRef.current?.editor as Editor | undefined;
    if (!editor) {
      return;
    }

    emitRenderedText(editor);
  }, [emitRenderedText, editorReturn.loading]);

  useEffect(() => {
    if (editorReturn.loading) {
      return;
    }

    const editor = crepeRef.current?.editor;
    if (!editor) {
      return;
    }

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setMeta(commentPluginKey, comments));
    });
  }, [comments, editorReturn.loading]);

  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [readOnly]);

  useEffect(() => {
    if (editorReturn.loading || !readOnly) {
      return;
    }

    const crepe = crepeRef.current;
    if (!crepe || crepe.getMarkdown() === content) {
      return;
    }

    crepe.editor.action(replaceAll(content));
  }, [content, editorReturn.loading, readOnly]);

  const getMarkdown = useCallback(() => {
    return crepeRef.current?.getMarkdown() ?? content;
  }, [content]);

  return {
    editorReturn,
    crepeRef,
    getMarkdown,
  };
}
