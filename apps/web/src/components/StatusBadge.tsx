export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'accent' | 'gold';

export const badgeToneClass: Record<BadgeTone, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-brand-sky/60 text-brand-navy',
  accent: 'bg-brand-teal/10 text-brand-teal',
  gold: 'bg-brand-yellow/30 text-amber-900',
};

export interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  className?: string;
}

export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold',
        badgeToneClass[tone],
        className ?? '',
      ].join(' ')}
    >
      {label}
    </span>
  );
}