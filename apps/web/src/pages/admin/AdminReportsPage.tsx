import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OrdersOverTimeChartPanel,
  RevenueBarChartPanel,
} from '../../features/analytics/chart-slot';
import type {
  AdminDashboardQuery,
  AdminReportQuery,
  BranchDto,
  DashboardBucket,
  DashboardSummaryDto,
  OrderStatus,
} from '@hungrybox/shared';
import { adminApi, ApiError, branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { branchStatusLabel, branchStatusTone } from '../../components/status';
import { PackageIcon } from '../../features/storefront/components/icons';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../../features/orders/order-status';
import { formatPaise } from '../../lib/money';
import { toBusinessISODate } from '../../lib/business-time';
import AdminLayout from './AdminLayout';

const BUCKET_OPTIONS: { value: DashboardBucket; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const STATUS_OPTIONS: { value: '' | OrderStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  ...(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => ({
    value: status,
    label: ORDER_STATUS_LABELS[status],
  })),
];

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; revenueMinor: number }[];
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No data for the selected period.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2 text-right">Count</th>
              <th className="py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 pr-2 font-semibold text-brand-navy">{row.label}</td>
                <td className="py-2.5 pr-2 text-right text-slate-700">{row.count}</td>
                <td className="py-2.5 text-right text-slate-700">
                  {formatPaise(row.revenueMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function AdminReportsPage(): JSX.Element {
  const { token } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toBusinessISODate(date);
  });
  const [to, setTo] = useState(() => toBusinessISODate(new Date()));
  const [bucket, setBucket] = useState<DashboardBucket>('day');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [dashboard, setDashboard] = useState<DashboardSummaryDto | null>(null);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * One filter object feeds both the dashboard and the CSV download.
   *
   * The Status control used to be applied only to the export, so the figures on screen
   * ignored it while the downloaded file honoured it - the two described different
   * datasets. Building both requests from the same object makes that drift impossible.
   */
  const filters = useMemo(
    () => ({
      branchId: branchId || undefined,
      from,
      to,
      status: status || undefined,
    }),
    [branchId, from, to, status],
  );

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const query: AdminDashboardQuery = { ...filters, bucket };
    adminApi
      .dashboard(query, token)
      .then(setDashboard)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the reports.'),
      )
      .finally(() => setLoading(false));
  }, [token, filters, bucket]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadBranches = useCallback(() => {
    if (!token) return;
    branchesApi
      .list(token)
      .then(setBranches)
      .catch((err: unknown) => {
        /**
         * Reported rather than swallowed. On this page the branch list is also the set of
         * valid range sources, so a silent failure looks like "no reports exist anywhere".
         */
        setBranchError(
          err instanceof Error ? err.message : 'Could not load the branch filter.',
        );
      });
  }, [token]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const exportCsv = (): void => {
    if (!token) return;
    setCsvBusy(true);
    setExportError(null);
    const query: AdminReportQuery = { ...filters };
    adminApi
      .ordersReportCsv(query, token)
      .then((csv) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'orders-report.csv';
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => {
        setExportError(
          err instanceof ApiError ? err.message : 'Could not export the orders report.',
        );
      })
      .finally(() => setCsvBusy(false));
  };

  const hasData =
    dashboard !== null &&
    (dashboard.orders > 0 ||
      dashboard.timeSeries.length > 0 ||
      dashboard.branchComparison.length > 0);

  return (
    <AdminLayout kicker="Global operations" title="Reports">
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-slate-700">
          Branch
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
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
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Bucket
          <select
            value={bucket}
            onChange={(event) => setBucket(event.target.value as DashboardBucket)}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
          >
            {BUCKET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as '' | OrderStatus)}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="accent"
          size="sm"
          onClick={exportCsv}
          loading={csvBusy}
          loadingLabel="Exporting…"
        >
          Download orders CSV
        </Button>
      </div>

      {exportError ? <Notice tone="error">{exportError}</Notice> : null}
      {branchError ? <Notice tone="warning">{branchError}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <LoadingState message="Loading reports" />
      ) : !dashboard || !hasData ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No report data"
            message={
              filters.status
                ? `No orders are in ${ORDER_STATUS_LABELS[filters.status]} for this branch and date range.`
                : 'Adjust the filters to see revenue, orders and branch performance.'
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Revenue</h2>
              {dashboard.timeSeries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No revenue data for the selected period.
                </p>
              ) : (
                <RevenueBarChartPanel data={dashboard.timeSeries} />
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Orders</h2>
              {dashboard.timeSeries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No order data for the selected period.
                </p>
              ) : (
                <OrdersOverTimeChartPanel data={dashboard.timeSeries} />
              )}
            </section>
          </div>

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Branch performance
            </h2>
            {dashboard.branchComparison.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No branch data for the selected period.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">Branch</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2 text-right">Orders</th>
                    <th className="py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.branchComparison.map((branch) => (
                    <tr key={branch.branchId} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-2 font-semibold text-brand-navy">
                        {branch.branchName}
                      </td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge
                          label={branchStatusLabel[branch.status]}
                          tone={branchStatusTone[branch.status]}
                        />
                      </td>
                      <td className="py-2.5 pr-2 text-right text-slate-700">{branch.orders}</td>
                      <td className="py-2.5 text-right text-slate-700">
                        {formatPaise(branch.revenueMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <BreakdownTable
              title="Order status"
              rows={dashboard.orderStatusBreakdown.map((item) => ({
                label: ORDER_STATUS_LABELS[item.status],
                count: item.count,
                revenueMinor: item.totalMinor,
              }))}
            />
            <BreakdownTable
              title="Payment method"
              rows={dashboard.paymentMethodBreakdown.map((item) => ({
                label: PAYMENT_METHOD_LABELS[item.method],
                count: item.count,
                revenueMinor: item.totalMinor,
              }))}
            />
          </div>
        </>
      )}
    </AdminLayout>
  );
}

