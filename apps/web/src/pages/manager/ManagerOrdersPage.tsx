import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OrderStatus, OrderSummaryDto } from '@hungrybox/shared';
import { branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import { ORDER_STATUS_LABELS } from '../../features/orders/order-status';
import { ORDER_STATUS_FILTERS } from '../../features/manager/manager-orders';
import { formatPaise } from '../../lib/money';
import ManagerLayout from './ManagerLayout';

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ManagerOrdersPage(): JSX.Element {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [status, setStatus] = useState<OrderStatus | undefined>(() => {
    const value = searchParams.get('status');
    return value && ORDER_STATUS_FILTERS.some((option) => option.value === value)
      ? (value as OrderStatus)
      : undefined;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    branchOrdersApi
      .list(token, status)
      .then(setOrders)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => setLoading(false));
  }, [token, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyStatus = (next: OrderStatus | undefined): void => {
    setStatus(next);
    setSearchParams(next ? { status: next } : {}, { replace: true });
  };

  return (
    <ManagerLayout kicker="Branch operations" title="Orders">
      <div className="mt-6 flex flex-wrap gap-2">
        {ORDER_STATUS_FILTERS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => applyStatus(option.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              status === option.value
                ? 'bg-brand-teal text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-sky/40'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-6 text-sm font-semibold text-red-600">{error}</p> : null}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading orders…</p>
      ) : orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No orders here"
            message="Orders placed in your branch will appear here."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/manager/orders/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-teal"
              >
                <div className="min-w-0">
                  <p className="font-bold text-brand-navy">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatPlacedAt(order.placedAt)} · {order.itemCount} item
                    {order.itemCount === 1 ? '' : 's'} · {order.branch.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-brand-navy">{formatPaise(order.totalMinor)}</span>
                  <span className="rounded-full bg-brand-sky/60 px-2.5 py-1 text-xs font-bold text-brand-navy">
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ManagerLayout>
  );
}
