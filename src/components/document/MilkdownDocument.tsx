import { useEffect, useMemo, useState } from 'react';

import type { CommentHighlight } from './milkdown/commentPlugin';
import type { TextSelection } from './milkdown/selectionCapture';
import type { CrepeEditorProps } from './milkdown/CrepeEditor';
import { CrepeEditor } from './milkdown/CrepeEditor';
import { RawEditor } from './RawEditor';
import { Button } from '../ui/Button';

export interface MilkdownDocumentProps {
  content: string;
  onSave: (markdown: string) => Promise<void>;
  isSaving?: boolean;
  comments: CommentHighlight[];
  onTextSelect: (selection: TextSelection) => void;
  onSelectComment: (id: string) => void;
  onRenderedText?: (text: string) => void;
}

export type Mode = 'view' | 'wysiwyg' | 'raw';

const MODES: Mode[] = ['view', 'wysiwyg', 'raw'];

function formatModeLabel(mode: Mode) {
  if (mode === 'wysiwyg') {
    return 'WYSIWYG';
  }

  return mode[0].toUpperCase() + mode.slice(1);
}

export function MilkdownDocument({
  content,
  onSave,
  isSaving = false,
  comments,
  onTextSelect,
  onSelectComment,
  onRenderedText,
}: MilkdownDocumentProps) {
  const [mode, setMode] = useState<Mode>('view');
  const [baselineContent, setBaselineContent] = useState(content);
  const [draftContent, setDraftContent] = useState(content);
  const [pendingSelection, setPendingSelection] =
    useState<TextSelection | null>(null);

  useEffect(() => {
    setBaselineContent(content);

    if (mode === 'view') {
      setDraftContent(content);
    }
  }, [content, mode]);

  const dirty = useMemo(
    () => draftContent !== baselineContent,
    [baselineContent, draftContent],
  );

  const handleModeChange = (nextMode: Mode) => {
    if (nextMode === mode) {
      return;
    }

    if ((mode === 'wysiwyg' || mode === 'raw') && dirty) {
      const discard = window.confirm('You have unsaved changes. Discard?');
      if (!discard) {
        return;
      }

      setDraftContent(baselineContent);
    }

    setPendingSelection(null);
    setMode(nextMode);
  };

  const handleSave = async (nextContent: string) => {
    await onSave(nextContent);
    setBaselineContent(nextContent);
    setDraftContent(nextContent);
    setPendingSelection(null);
    setMode('view');
  };

  const crepeProps: CrepeEditorProps = {
    content: mode === 'view' ? baselineContent : draftContent,
    readOnly: mode === 'view',
    comments,
    onSelectComment,
    onTextSelect: (selection) => {
      setPendingSelection(selection);
    },
    onMarkdownChange: (markdown) => {
      if (mode === 'wysiwyg') {
        setDraftContent(markdown);
      }
    },
    onRenderedText,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((nextMode) => {
            const active = nextMode === mode;

            return (
              <Button
                key={nextMode}
                aria-pressed={active}
                onClick={() => handleModeChange(nextMode)}
                type="button"
                variant={active ? 'primary' : 'secondary'}
              >
                {formatModeLabel(nextMode)}
              </Button>
            );
          })}
        </div>

        {mode === 'wysiwyg' ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-cyan-400/70">Editing</span>
            <Button
              disabled={isSaving}
              onClick={() => void handleSave(draftContent)}
              type="button"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className={[
          'relative rounded-2xl border p-6',
          mode === 'wysiwyg'
            ? 'border-cyan-800/60 bg-slate-900/70'
            : 'border-slate-800 bg-slate-900/50',
        ].join(' ')}
      >
        {mode === 'raw' ? (
          <RawEditor
            initialContent={draftContent}
            isSaving={isSaving}
            onCancel={() => {
              setDraftContent(baselineContent);
              setPendingSelection(null);
              setMode('view');
            }}
            onChange={setDraftContent}
            onSave={handleSave}
          />
        ) : (
          <CrepeEditor {...crepeProps} />
        )}

        {pendingSelection ? (
          <div
            className="fixed z-20"
            style={{
              left: pendingSelection.coords.left,
              top: Math.max(8, pendingSelection.coords.top - 40),
            }}
          >
            <Button
              onClick={() => {
                onTextSelect(pendingSelection);
                setPendingSelection(null);
              }}
              type="button"
            >
              Comment
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
