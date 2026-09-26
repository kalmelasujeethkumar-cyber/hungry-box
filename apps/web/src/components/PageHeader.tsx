import type { ReactNode } from 'react';

export interface PageHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ kicker, title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={['flex flex-wrap items-start justify-between gap-4', className ?? ''].join(' ')}>
      <div>
        {kicker ? (
          <p className="text-xs font-bold uppercase tracking-widest text-brand-orange">{kicker}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-navy sm:text-3xl">{title}</h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}