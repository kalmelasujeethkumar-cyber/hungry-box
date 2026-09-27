import type { JSX } from 'react';

export interface PaginationProps {
  /** 1-based page currently displayed. */
  page: number;
  /** Rows per page the server applied. */
  limit: number;
  /** Total rows matching the filters, not just this page. */
  total: number;
  /** Rows actually rendered in this page. */
  shown: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Distinguishes lists that are filtered from ones that are not. */
  filtered?: boolean;
}

/**
 * Page controls for a server-paged management list.
 *
 * The total comes from the server, so this can say how many rows matched rather than
 * implying that the visible page is the whole list. Only the controls that actually lead
 * somewhere are enabled, so a manager cannot page past the end and land on an empty
 * screen that looks like a data-loss bug.
 */
export default function Pagination({
  page,
  limit,
  total,
  shown,
  onPageChange,
  disabled = false,
  filtered = false,
}: PaginationProps): JSX.Element | null {
  const lastPage = Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  const firstRow = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow = total === 0 ? 0 : firstRow + shown - 1;

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
    >
      <p className="text-sm text-slate-600" data-testid="pagination-summary">
        {total === 0
          ? filtered
            ? 'No matching records'
            : 'No records yet'
          : `Showing ${firstRow}–${lastRow} of ${total}${filtered ? ' matching' : ''}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-brand-navy disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          Previous
        </button>
        <span className="text-sm text-slate-600" data-testid="pagination-position">
          Page {page} of {lastPage}
        </span>
        <button
          type="button"
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-brand-navy disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= lastPage}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
