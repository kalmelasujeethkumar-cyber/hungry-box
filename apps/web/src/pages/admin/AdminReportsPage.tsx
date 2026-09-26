import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { branchStatusLabel, branchStatusTone } from '../../components/status';
import { PackageIcon } from '../../features/storefront/components/icons';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../../features/orders/order-status';
import { formatPaise } from '../../lib/money';
import { toISODate } from '../../lib/format';
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
    return toISODate(date);
  });
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [bucket, setBucket] = useState<DashboardBucket>('day');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [dashboard, setDashboard] = useState<DashboardSummaryDto | null>(null);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const query: AdminDashboardQuery = {
      branchId: branchId || undefined,
      from,
      to,
      bucket,
    };
    adminApi
      .dashboard(query, token)
      .then(setDashboard)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load the reports.'),
      )
      .finally(() => setLoading(false));
  }, [token, branchId, from, to, bucket]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadBranches = useCallback(() => {
    if (!token) return;
    branchesApi
      .list(token)
      .then(setBranches)
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const exportCsv = (): void => {
    if (!token) return;
    setCsvBusy(true);
    setExportError(null);
    const query: AdminReportQuery = {
      branchId: branchId || undefined,
      from,
      to,
      status: status || undefined,
    };
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
        <button
          type="button"
          onClick={exportCsv}
          disabled={csvBusy}
          className="rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {csvBusy ? 'Exporting…' : 'Download orders CSV'}
        </button>
      </div>

      {exportError ? <Notice tone="error">{exportError}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <LoadingState message="Loading reports" />
      ) : !dashboard || !hasData ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No report data"
            message="Adjust the filters to see revenue, orders and branch performance."
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
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.timeSeries}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatPaise(Number(value))}
                      />
                      <Tooltip formatter={(value) => formatPaise(Number(value))} />
                      <Bar dataKey="revenueMinor" name="Revenue" fill="#FF6500" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Orders</h2>
              {dashboard.timeSeries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No order data for the selected period.
                </p>
              ) : (
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.timeSeries}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="orders"
                        name="Orders"
                        stroke="#004E9B"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
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
