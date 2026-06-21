import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}

export function Button({ children, className = '', variant = 'primary', ...props }: ButtonProps) {
  const variantClasses =
    variant === 'primary'
      ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
      : 'border border-slate-700 bg-transparent text-slate-100 hover:border-slate-500 hover:bg-slate-800';

  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
