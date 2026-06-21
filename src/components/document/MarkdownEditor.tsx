import { useEffect, useMemo, useState } from 'react';

import { Button } from '../ui/Button';

export function MarkdownEditor({
  initialContent,
  onSave,
  onCancel,
  isSaving,
}: {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const dirty = content !== initialContent;
  const lineCount = useMemo(() => Math.max(1, content.split('\n').length), [content]);

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-slate-300">
          <span>{content.length} characters</span>
          <span className="mx-2">·</span>
          <span>{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              if (!dirty || window.confirm('You have unsaved changes. Discard?')) {
                onCancel();
              }
            }}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button disabled={isSaving} onClick={() => void onSave(content)} type="button">
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <label className="sr-only" htmlFor="markdown-editor">
        Markdown editor
      </label>
      <textarea
        id="markdown-editor"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') {
            return;
          }

          event.preventDefault();
          const target = event.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const next = `${content.slice(0, start)}  ${content.slice(end)}`;
          setContent(next);

          requestAnimationFrame(() => {
            target.selectionStart = start + 2;
            target.selectionEnd = start + 2;
          });
        }}
        className="min-h-[60vh] w-full flex-1 rounded-2xl border border-slate-800 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100"
        spellCheck={false}
      />
    </div>
  );
}
