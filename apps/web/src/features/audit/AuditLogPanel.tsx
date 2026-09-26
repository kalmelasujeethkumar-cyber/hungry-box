import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuditListQuery, AuditListResultDto, BranchDto } from '@hungrybox/shared';
import { ApiError, branchAuditApi } from '../../api/client';
import { Button } from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { formatDateTime } from '../../lib/format';
import { PackageIcon } from '../storefront/components/icons';
import { AUDIT_KIND_OPTIONS, auditKindLabel, auditRoleLabel } from './audit-labels';

const PAGE_SIZE = 25;

const SELECT_CLASS = 'ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';
const INPUT_CLASS = 'ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm';
const LABEL_CLASS = 'text-sm font-semibold text-slate-700';

export interface AuditLogPanelProps {
  token: string | null;
  /** Shown in the empty state so each role explains its own scope. */
  emptyMessage: string;
  /**
   * Supplied by the super admin only. When present the panel exposes a branch
   * filter and resolves branch ids to names; a branch manager never sees it.
   */
  branches?: readonly BranchDto[];
}

export function AuditLogPanel({ token, emptyMessage, branches }: AuditLogPanelProps): JSX.Element {
  const showBranchFilter = branches !== undefined;
  const [result, setResult] = useState<AuditListResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [kind, setKind] = useState('');
  const [branchId, setBranchId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const buildQuery = useCallback(
    (): AuditListQuery => ({
      kind: kind || undefined,
      branchId: showBranchFilter ? branchId || undefined : undefined,
      entityType: entityType.trim() || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [kind, showBranchFilter, branchId, entityType, from, to, page],
  );

  const refresh = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    branchAuditApi
      .list(buildQuery(), token)
      .then(setResult)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load events.'),
      )
      .finally(() => setLoading(false));
  }, [token, buildQuery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const exportCsv = (): void => {
    if (!token) return;
    setError(null);
    setExporting(true);
    branchAuditApi
      .exportCsv(buildQuery(), token)
      .then((csv) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'audit-events.csv';
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not export events.');
      })
      .finally(() => setExporting(false));
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const branchNameById = useMemo(
    () => new Map((branches ?? []).map((branch) => [branch.id, branch.name])),
    [branches],
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL_CLASS}>
          Kind
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
            className={SELECT_CLASS}
          >
            {AUDIT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {showBranchFilter ? (
          <label className={LABEL_CLASS}>
            Branch
            <select
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setPage(1);
              }}
              className={SELECT_CLASS}
            >
              <option value="">All branches</option>
              {(branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={LABEL_CLASS}>
          Entity
          <input
            type="text"
            value={entityType}
            placeholder="e.g. Order"
            onChange={(event) => {
              setEntityType(event.target.value);
              setPage(1);
            }}
            className={`${INPUT_CLASS} w-32`}
          />
        </label>
        <label className={LABEL_CLASS}>
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          To
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          />
        </label>
        <Button variant="primary" onClick={exportCsv} loading={exporting} loadingLabel="Exporting…">
          Export CSV
        </Button>
      </div>

      {error ? (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      ) : null}

      {loading ? (
        <LoadingState message="Loading events…" className="mt-8" />
      ) : !result || result.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No audit events"
            message={emptyMessage}
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {result.items.map((event) => (
            <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-brand-navy">{auditKindLabel(event.kind)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {event.entityType}
                    {event.entityId ? ` · ${event.entityId}` : ''}
                    {event.actorRole ? ` · ${auditRoleLabel(event.actorRole)}` : ''}
                    {event.branchId ? ` · branch ${event.branchId}` : ''}
                    {event.branchId && branchNameById.has(event.branchId)
                      ? ` (${branchNameById.get(event.branchId)})`
                      : ''}
                  </p>
                  {event.message ? (
                    <p className="mt-1 text-sm text-slate-600">{event.message}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDateTime(event.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="text-sm text-slate-500">
          Page {page} of {totalPages} · {result?.total ?? 0} events
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
