import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { AuditListQuery, AuditListResultDto, BranchDto } from '@hungrybox/shared';
import { ApiError, branchAuditApi, branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../features/storefront/components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import AdminLayout from './AdminLayout';

const KIND_OPTIONS = [
  { value: '', label: 'All kinds' },
  { value: 'ORDER_CREATED', label: 'Order created' },
  { value: 'ORDER_STATUS_CHANGED', label: 'Order status changed' },
  { value: 'ORDER_CANCELLED', label: 'Order cancelled' },
  { value: 'BRANCH_PRODUCT_CREATED', label: 'Product configured' },
  { value: 'BRANCH_PRODUCT_UPDATED', label: 'Product updated' },
  { value: 'BRANCH_PRODUCT_DEACTIVATED', label: 'Product deactivated' },
  { value: 'BRANCH_SETTINGS_UPDATED', label: 'Settings updated' },
  { value: 'DELIVERY_ASSIGNED', label: 'Delivery assigned' },
  { value: 'DELIVERY_COMPLETED', label: 'Delivery completed' },
  { value: 'BRANCH_UPDATED', label: 'Branch updated' },
  { value: 'BRANCH_STATUS_CHANGED', label: 'Branch status changed' },
  { value: 'USER_CREATED', label: 'User created' },
  { value: 'USER_STATUS_CHANGED', label: 'User status changed' },
  { value: 'PRODUCT_CREATED', label: 'Global product created' },
  { value: 'PRODUCT_UPDATED', label: 'Global product updated' },
  { value: 'PRODUCT_STATUS_CHANGED', label: 'Global product status changed' },
  { value: 'PRODUCT_IMAGE_ADDED', label: 'Product image added' },
  { value: 'PRODUCT_IMAGE_UPDATED', label: 'Product image updated' },
  { value: 'PRODUCT_IMAGE_REMOVED', label: 'Product image removed' },
  { value: 'CATEGORY_CREATED', label: 'Category created' },
  { value: 'CATEGORY_UPDATED', label: 'Category updated' },
  { value: 'CATEGORY_STATUS_CHANGED', label: 'Category status changed' },
];

const PAGE_SIZE = 25;

function humanizeKind(kind: string): string {
  return kind.replace(/_/g, ' ').toLowerCase();
}

export default function AdminAuditPage(): JSX.Element {
  const { token } = useAuth();
  const [result, setResult] = useState<AuditListResultDto | null>(null);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('');
  const [branchId, setBranchId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const buildQuery = useCallback(
    (): AuditListQuery => ({
      kind: kind || undefined,
      branchId: branchId || undefined,
      entityType: entityType.trim() || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [kind, branchId, entityType, from, to, page],
  );

  const refresh = useCallback(() => {
    if (!token) return;
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

  useEffect(() => {
    if (!token) return;
    branchesApi
      .list(token)
      .then(setBranches)
      .catch(() => undefined);
  }, [token]);

  const exportCsv = (): void => {
    if (!token) return;
    setError(null);
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
      });
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <AdminLayout kicker="Global operations" title="Audit log">
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-slate-700">
          Kind
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Branch
          <select
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Entity
          <input
            type="text"
            value={entityType}
            placeholder="e.g. Order"
            onChange={(event) => {
              setEntityType(event.target.value);
              setPage(1);
            }}
            className="ml-2 w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90"
        >
          Export CSV
        </button>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading events…</p>
      ) : !result || result.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No audit events"
            message="Platform activity will be recorded here as it happens."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {result.items.map((event) => (
            <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-brand-navy">{humanizeKind(event.kind)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {event.entityType}
                    {event.entityId ? ` · ${event.entityId}` : ''}
                    {event.actorRole ? ` · ${event.actorRole}` : ''}
                    {event.branchId ? ` · branch ${event.branchId}` : ''}
                  </p>
                  {event.message ? (
                    <p className="mt-1 text-sm text-slate-600">{event.message}</p>
                  ) : null}
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(event.createdAt).toLocaleString('en-IN')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-500">
          Page {page} of {totalPages} · {result?.total ?? 0} events
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </AdminLayout>
  );
}
