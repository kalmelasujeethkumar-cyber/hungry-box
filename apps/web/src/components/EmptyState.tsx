import type { JSX } from 'react';

export interface EmptyStateProps {
  icon: JSX.Element;
  title: string;
  message: string;
  action?: JSX.Element;
}

export default function EmptyState({ icon, title, message, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-sky text-brand-navy">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-bold text-brand-navy">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}