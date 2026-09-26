import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'destructive'
  | 'ghost'
  | 'accent'
  | 'success'
  | 'accentOutline'
  | 'dangerOutline'
  | 'successOutline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-orange text-white hover:bg-brand-orange/90',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:border-brand-teal hover:text-brand-teal',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-brand-teal hover:bg-brand-sky/40',
  accent: 'bg-brand-teal text-white hover:bg-brand-teal/90',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  accentOutline: 'border border-brand-teal text-brand-teal hover:bg-brand-sky/40',
  dangerOutline: 'border border-red-200 text-red-600 hover:bg-red-50',
  successOutline: 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs font-bold',
  md: 'px-4 py-2.5 text-sm font-semibold',
  lg: 'px-6 py-3 text-base font-bold',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
});
