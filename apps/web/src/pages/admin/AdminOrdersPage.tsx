import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { BranchDto, OrderStatus, OrderSummaryDto } from '@hungrybox/shared';
import { branchOrdersApi, branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { PackageIcon } from '../../features/storefront/components/icons';
import { ORDER_STATUS_FILTERS } from '../../features/manager/manager-orders';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '../../features/orders/order-status';
import { formatPlacedAt } from '../../lib/format';
import { formatPaise } from '../../lib/money';
import AdminLayout from './AdminLayout';

export default function AdminOrdersPage(): JSX.Element {
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    branchOrdersApi
      .listGlobal(token, { branchId: branchId || undefined, status })
      .then(setOrders)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load orders.'),
      )
      .finally(() => setLoading(false));
  }, [token, branchId, status]);

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

  return (
    <AdminLayout kicker="Global operations" title="Orders">
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-700">
          Branch
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-brand-teal focus:outline-none"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <FilterChips
          options={ORDER_STATUS_FILTERS}
          value={status}
          onChange={setStatus}
          ariaLabel="Filter orders by status"
        />
      </div>

      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {loading ? (
        <LoadingState message="Loading orders…" className="mt-8" />
      ) : orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No orders here"
            message="Orders across your branches will appear here."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0">
                <p className="font-bold text-brand-navy">{order.orderNumber}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatPlacedAt(order.placedAt)} · {order.itemCount} item
                  {order.itemCount === 1 ? '' : 's'} · {order.branch.name} ·{' '}
                  {order.paymentMethod
                    ? PAYMENT_METHOD_LABELS[order.paymentMethod]
                    : 'No payment method'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-brand-navy">{formatPaise(order.totalMinor)}</span>
                <StatusBadge
                  label={PAYMENT_STATUS_LABELS[order.paymentStatus]}
                  tone={PAYMENT_STATUS_TONES[order.paymentStatus]}
                />
                <StatusBadge
                  label={ORDER_STATUS_LABELS[order.status]}
                  tone={ORDER_STATUS_TONES[order.status]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminLayout>
  );
}
