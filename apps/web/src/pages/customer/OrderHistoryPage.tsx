import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OrderStatus, OrderSummaryDto } from '@hungrybox/shared';
import { ordersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import EmptyState from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { PackageIcon } from '../../features/storefront/components/icons';
import { formatDateOnly } from '../../lib/format';
import { formatPaise } from '../../lib/money';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
} from '../../features/orders/order-status';

type Filter = 'all' | 'active' | 'delivered' | 'cancelled';

const FILTER_STATUSES: Record<Exclude<Filter, 'all'>, OrderStatus[]> = {
  active: ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'],
  delivered: ['DELIVERED'],
  cancelled: ['CANCELLED'],
};

export default function HistoryPage(): JSX.Element {
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    ordersApi
      .list(token)
      .then((list) => {
        if (!cancelled) {
          setOrders(list);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not load your orders.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const visible =
    filter === 'all'
      ? orders
      : orders.filter((order) => FILTER_STATUSES[filter].includes(order.status));

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: orders.length },
    {
      key: 'active',
      label: 'Active',
      count: orders.filter((order) => FILTER_STATUSES.active.includes(order.status)).length,
    },
    {
      key: 'delivered',
      label: 'Delivered',
      count: orders.filter((order) => FILTER_STATUSES.delivered.includes(order.status)).length,
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      count: orders.filter((order) => FILTER_STATUSES.cancelled.includes(order.status)).length,
    },
  ];

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-brand-navy">Your orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track active orders and revisit everything you ordered.
        </p>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <LoadingState message="Loading your orders" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="h-8 w-8" />}
          title="No orders yet"
          message="Once you place an order it will show up here with live status."
          action={
            <Link
              to="/customer/storefront"
              className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white"
            >
              Browse the menu
            </Link>
          }
        />
      ) : (
        <div>
          <div className="flex gap-2" role="tablist" aria-label="Filter orders">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={filter === tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                  filter === tab.key
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-sky/40'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No orders in this tab yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {visible.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/customer/orders/${order.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-teal"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-brand-navy">
                          {order.orderNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {order.branch.name} · {formatDateOnly(order.placedAt)} ·{' '}
                          {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : '—'}
                        </p>
                      </div>
                      <StatusBadge label={ORDER_STATUS_LABELS[order.status]} tone={ORDER_STATUS_TONES[order.status]} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatPaise(order.totalMinor)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
