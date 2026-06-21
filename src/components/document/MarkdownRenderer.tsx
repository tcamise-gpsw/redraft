import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import type { CommentThread } from '../../types/comments';

interface MarkdownRendererProps {
  content: string;
  comments: CommentThread[];
  onSelectComment: (id: string) => void;
  onTextSelect: (quote: string, context: { prefix: string; suffix: string }) => void;
}

export function MarkdownRenderer({ content, comments, onSelectComment, onTextSelect }: MarkdownRendererProps) {
  const highlightedContent = useMemo(() => {
    let next = content;

    comments.forEach((comment) => {
      if (!comment.quote) {
        return;
      }

      const token = `<mark data-comment-id="${comment.id}">${comment.quote}</mark>`;
      next = next.replace(comment.quote, token);
    });

    return next;
  }, [comments, content]);

  return (
    <div
      className="prose prose-invert max-w-none prose-pre:rounded-xl prose-pre:border prose-pre:border-slate-800 prose-pre:bg-slate-950"
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        const commentId = target?.closest('mark')?.getAttribute('data-comment-id');

        if (commentId) {
          onSelectComment(commentId);
        }
      }}
      onMouseUp={() => {
        const quote = window.getSelection()?.toString().trim() ?? '';

        if (!quote) {
          return;
        }

        const start = content.indexOf(quote);

        if (start < 0) {
          return;
        }

        const prefix = content.slice(Math.max(0, start - 100), start);
        const suffix = content.slice(start + quote.length, start + quote.length + 100);

        onTextSelect(quote, { prefix, suffix });
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHighlight]} skipHtml={false}>
        {highlightedContent}
      </ReactMarkdown>
    </div>
  );
}
