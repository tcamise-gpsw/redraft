import { Fragment, createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { nanoid } from 'nanoid';

import { Toast, type ToastMessage } from '../components/ui/Toast';

interface ToastContextValue {
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = nanoid();
      setToasts((current) => [...current, { ...toast, id }]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== id));
      }, 5000);
    },
    [],
  );

  const value = useMemo(
    () => ({ toasts, dismissToast, showToast }),
    [dismissToast, showToast, toasts],
  );

  return createElement(
    ToastContext.Provider,
    { value },
    createElement(
      Fragment,
      null,
      children,
      createElement(
        'div',
        {
          className:
            'pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-3',
        },
        ...toasts.map((toast) =>
          createElement(
            'div',
            {
              className: 'pointer-events-auto',
              key: toast.id,
            },
            createElement(Toast, {
              toast,
              onDismiss: dismissToast,
            }),
          ),
        ),
      ),
    ),
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
