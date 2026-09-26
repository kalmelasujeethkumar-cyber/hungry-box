import type { ReactNode } from 'react';

export type NoticeTone = 'success' | 'error' | 'warning' | 'info';

const TONE_CLASSES: Record<NoticeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-brand-sky bg-brand-sky/30 text-brand-navy',
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Notice({ tone = 'info', title, children, className }: NoticeProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={[
        'rounded-lg border px-4 py-3 text-sm leading-relaxed',
        TONE_CLASSES[tone],
        className ?? '',
      ].join(' ')}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      {children}
    </div>
  );
}