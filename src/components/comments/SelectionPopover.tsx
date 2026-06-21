import { useEffect, useState } from 'react';

import { Button } from '../ui/Button';

interface PendingSelection {
  quote: string;
  context: {
    prefix: string;
    suffix: string;
  };
}

export function SelectionPopover({
  rootSelector,
  onSelect,
}: {
  rootSelector: string;
  onSelect: (selection: PendingSelection) => void;
}) {
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const evaluate = () => {
      const selected = window.getSelection();
      const quote = selected?.toString().trim() ?? '';
      const range = selected?.rangeCount ? selected.getRangeAt(0) : null;
      const root = document.querySelector(rootSelector);

      if (!quote || !range || !root?.contains(range.commonAncestorContainer)) {
        setSelection(null);
        setPosition(null);
        return;
      }

      const rootText = root.textContent ?? '';
      const start = rootText.indexOf(quote);
      if (start < 0) {
        setSelection(null);
        setPosition(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelection({
        quote,
        context: {
          prefix: rootText.slice(Math.max(0, start - 100), start),
          suffix: rootText.slice(
            start + quote.length,
            start + quote.length + 100,
          ),
        },
      });
      // The popover is `position: fixed` — viewport-relative coordinates.
      // getBoundingClientRect() already returns viewport coords; do NOT add
      // window.scrollX/Y or the button drifts off-screen when scrolled.
      setPosition({
        left: rect.left,
        top: Math.max(8, rect.top - 40),
      });
    };

    // Only show/update when the user *finishes* selecting (mouseup / keyup).
    // Listening to selectionchange fires on every drag pixel causing flicker.
    const clearIfEmpty = () => {
      if (!window.getSelection()?.toString().trim()) {
        setSelection(null);
        setPosition(null);
      }
    };

    document.addEventListener('mouseup', evaluate);
    document.addEventListener('keyup', evaluate);
    document.addEventListener('selectionchange', clearIfEmpty);
    return () => {
      document.removeEventListener('mouseup', evaluate);
      document.removeEventListener('keyup', evaluate);
      document.removeEventListener('selectionchange', clearIfEmpty);
    };
  }, [rootSelector]);

  if (!selection || !position) {
    return null;
  }

  return (
    <div
      className="fixed z-40"
      style={{ left: position.left, top: position.top }}
    >
      <Button
        onClick={() => {
          onSelect(selection);
          setSelection(null);
          setPosition(null);
        }}
        type="button"
      >
        Comment
      </Button>
    </div>
  );
}
