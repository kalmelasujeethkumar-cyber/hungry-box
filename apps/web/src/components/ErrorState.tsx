import { Notice } from './Notice';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this content. Please try again.',
  error,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div className={['flex flex-col items-center gap-3 py-8 text-center', className ?? ''].join(' ')}>
      <Notice tone="error" title={title}>
        <p>{message}</p>
        {error instanceof Error && message !== error.message ? (
          <p className="mt-1 text-xs opacity-80">{error.message}</p>
        ) : null}
      </Notice>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-brand-teal hover:bg-brand-sky/40"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
