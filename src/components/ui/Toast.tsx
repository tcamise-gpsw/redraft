export interface ToastMessage {
  id: string;
  tone: 'info' | 'error';
  title: string;
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={[
        'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg shadow-black/30',
        toast.tone === 'error'
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
          : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
      ].join(' ')}
      role="status"
    >
      <div className="flex-1 text-sm font-medium">{toast.title}</div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="text-xs uppercase tracking-wide"
      >
        Dismiss
      </button>
    </div>
  );
}
