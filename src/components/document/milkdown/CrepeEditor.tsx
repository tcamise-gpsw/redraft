import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame-dark.css';

import {
  Component,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';

import { EditorStatus } from '@milkdown/kit/core';
import { Milkdown, MilkdownProvider } from '@milkdown/react';

import type { CommentHighlight } from './commentPlugin';
import type { TextSelection } from './selectionCapture';
import {
  useCrepeInstance,
  type UseCrepeInstanceOptions,
} from './useCrepeInstance';

export interface CrepeEditorProps extends UseCrepeInstanceOptions {
  content: string;
  readOnly: boolean;
  comments: CommentHighlight[];
  onTextSelect?: (selection: TextSelection) => void;
  onSelectComment?: (id: string) => void;
  onMarkdownChange?: (markdown: string) => void;
}

export interface CrepeEditorHandle {
  getMarkdown: () => string;
}

interface CrepeErrorBoundaryProps {
  children: ReactNode;
  content: string;
}

interface CrepeErrorBoundaryState {
  hasError: boolean;
}

function CrepeFallback({ content }: { content: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
      <div className="text-sm font-medium text-rose-100" role="alert">
        Milkdown failed to initialize.
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950/70 p-4 text-sm text-slate-100">
        {content}
      </pre>
    </div>
  );
}

class CrepeErrorBoundary extends Component<
  CrepeErrorBoundaryProps,
  CrepeErrorBoundaryState
> {
  state: CrepeErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): CrepeErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  render() {
    if (this.state.hasError) {
      return <CrepeFallback content={this.props.content} />;
    }

    return this.props.children;
  }
}

const CrepeEditorContent = forwardRef<CrepeEditorHandle, CrepeEditorProps>(
  function CrepeEditorContent(props, ref) {
    const { content } = props;
    const { crepeRef, editorReturn, getMarkdown } = useCrepeInstance(props);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown,
      }),
      [getMarkdown],
    );

    const failedToInitialize =
      !editorReturn.loading &&
      crepeRef.current != null &&
      crepeRef.current.editor.status !== EditorStatus.Created;

    if (failedToInitialize) {
      return <CrepeFallback content={content} />;
    }

    return (
      <div className="milkdown-document-wrapper">
        <Milkdown />
      </div>
    );
  },
);

export const CrepeEditor = forwardRef<CrepeEditorHandle, CrepeEditorProps>(
  function CrepeEditor(props, ref) {
    return (
      <CrepeErrorBoundary content={props.content}>
        <MilkdownProvider>
          <CrepeEditorContent ref={ref} {...props} />
        </MilkdownProvider>
      </CrepeErrorBoundary>
    );
  },
);

export { useCrepeInstance } from './useCrepeInstance';
