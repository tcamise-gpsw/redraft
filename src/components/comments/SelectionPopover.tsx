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
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
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
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelection({
        quote,
        context: {
          prefix: rootText.slice(Math.max(0, start - 100), start),
          suffix: rootText.slice(start + quote.length, start + quote.length + 100),
        },
      });
      setPosition({
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY - 40,
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [rootSelector]);

  if (!selection || !position) {
    return null;
  }

  return (
    <div className="fixed z-40" style={{ left: position.left, top: position.top }}>
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
