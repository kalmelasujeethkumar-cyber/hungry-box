export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={[
        'flex min-h-24 items-center justify-center gap-2 text-sm font-semibold text-slate-500',
        className ?? '',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span>{message}</span>
    </div>
  );
}