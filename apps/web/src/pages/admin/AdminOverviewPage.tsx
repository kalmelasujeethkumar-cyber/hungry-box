import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AdminDashboardQuery,
  BranchDto,
  DashboardBucket,
  DashboardSummaryDto,
} from '@hungrybox/shared';
import { adminApi, branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../features/storefront/components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../../features/orders/order-status';
import { formatPaise } from '../../lib/money';
import AdminLayout from './AdminLayout';

const BUCKET_OPTIONS: { value: DashboardBucket; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function MetricCard({
  label,
  value,
  to,
  accent,
}: {
  label: string;
  value: string;
  to?: string;
  accent: string;
}): JSX.Element {
  const inner = (
    <>
      <p className={`text-3xl font-extrabold ${accent}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-teal"
      >
        {inner}
      </Link>
    );
  }
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">{inner}</div>;
}

export default function AdminOverviewPage(): JSX.Element {
  const { token } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toISODate(date);
  });
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [bucket, setBucket] = useState<DashboardBucket>('day');
  const [dashboard, setDashboard] = useState<DashboardSummaryDto | null>(null);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Could not load the overview.'),
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

  const hasData =
    dashboard !== null &&
    (dashboard.orders > 0 ||
      dashboard.timeSeries.length > 0 ||
      dashboard.branchComparison.length > 0);

  return (
    <AdminLayout kicker="Global operations" title="Overview">
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
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading overview…</p>
      ) : !dashboard || !hasData ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No overview data"
            message="Adjust the filters or add orders to see global performance."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Revenue"
              value={formatPaise(dashboard.revenueMinor)}
              accent="text-brand-navy"
            />
            <MetricCard
              label="Orders"
              value={String(dashboard.orders)}
              to="/admin/orders"
              accent="text-brand-orange"
            />
            <MetricCard
              label="Customers"
              value={String(dashboard.customers)}
              accent="text-brand-teal"
            />
            <MetricCard
              label="Avg order value"
              value={formatPaise(dashboard.averageOrderValueMinor)}
              accent="text-yellow-600"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-brand-yellow/50 bg-brand-yellow/10 p-5">
              <p className="text-3xl font-extrabold text-brand-navy">{dashboard.cod.totalOrders}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">Cash-on-delivery orders</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <p className="text-3xl font-extrabold text-emerald-700">
                {formatPaise(dashboard.cod.collectedMinor)}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Cash collected · {dashboard.cod.collectedCount} orders
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <p className="text-3xl font-extrabold text-amber-700">
                {formatPaise(dashboard.cod.uncollectedMinor)}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Cash pending · {dashboard.cod.uncollectedCount} orders
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Active branches"
              value={String(dashboard.activeBranches)}
              to="/admin/branches"
              accent="text-emerald-600"
            />
            <MetricCard
              label="Paused branches"
              value={String(dashboard.pausedBranches)}
              to="/admin/branches"
              accent="text-amber-600"
            />
            <MetricCard
              label="Inactive branches"
              value={String(dashboard.inactiveBranches)}
              to="/admin/branches"
              accent="text-slate-600"
            />
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Revenue over time
              </h2>
              {dashboard.timeSeries.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No time-series data for the selected period.
                </p>
              ) : (
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboard.timeSeries}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => formatPaise(Number(value))}
                      />
                      <Tooltip formatter={(value) => formatPaise(Number(value))} />
                      <Area
                        type="monotone"
                        dataKey="revenueMinor"
                        name="Revenue"
                        stroke="#0091B9"
                        fill="#0091B9"
                        fillOpacity={0.15}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Revenue by branch
              </h2>
              {dashboard.branchComparison.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No branch data for the selected period.
                </p>
              ) : (
                <div className="mt-4 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.branchComparison}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="branchName" tick={{ fontSize: 12 }} />
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
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Orders by status
              </h2>
              {dashboard.orderStatusBreakdown.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No orders in this period.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dashboard.orderStatusBreakdown.map((item) => (
                    <li
                      key={item.status}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-medium text-slate-600">
                        {ORDER_STATUS_LABELS[item.status]}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="font-bold text-brand-navy">{item.count}</span>
                        <span className="text-xs text-slate-500">
                          {formatPaise(item.totalMinor)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Payments</h2>
              {dashboard.paymentMethodBreakdown.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No payments in this period.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dashboard.paymentMethodBreakdown.map((item) => (
                    <li
                      key={item.method}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="font-medium text-slate-600">
                        {PAYMENT_METHOD_LABELS[item.method]}
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="font-bold text-brand-navy">{item.count}</span>
                        <span className="text-xs text-slate-500">
                          {formatPaise(item.totalMinor)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Top products
              </h2>
              {dashboard.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No products sold in this period.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dashboard.topProducts.map((product) => (
                    <li
                      key={product.productName}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate font-medium text-slate-600">
                        {product.productName}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {product.quantity} sold · {formatPaise(product.revenueMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Cancellations
              </h2>
              <p className="mt-3 text-3xl font-extrabold text-brand-navy">
                {dashboard.cancellations.count}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {formatPaise(dashboard.cancellations.amountMinor)} cancelled
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Refunds</h2>
              <p className="mt-3 text-3xl font-extrabold text-brand-orange">
                {dashboard.refunds.count}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {formatPaise(dashboard.refunds.amountMinor)} refunded
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Delivery</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600">Active partners</span>
                  <span className="font-bold text-brand-navy">
                    {dashboard.delivery.activePartners}
                  </span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600">Assigned</span>
                  <span className="font-bold text-brand-navy">{dashboard.delivery.assigned}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600">Out for delivery</span>
                  <span className="font-bold text-brand-navy">
                    {dashboard.delivery.outForDelivery}
                  </span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600">Delivered</span>
                  <span className="font-bold text-brand-navy">{dashboard.delivery.delivered}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-slate-600">Cancelled or rejected</span>
                  <span className="font-bold text-brand-navy">
                    {dashboard.delivery.cancelledOrRejected}
                  </span>
                </li>
              </ul>
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
