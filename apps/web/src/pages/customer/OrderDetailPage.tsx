import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { OrderDetailDto } from '@hungrybox/shared';
import { ApiError, ordersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { PackageIcon } from '../../features/storefront/components/icons';
import OrderTimeline from '../../features/orders/OrderTimeline';
import DeliveryTrackingSection from '../../features/orders/DeliveryTrackingSection';
import {
  isCustomerCancellable,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../features/orders/order-status';
import { formatDateTime } from '../../lib/format';
import { formatPaise } from '../../lib/money';

export default function OrderDetailPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!token || !orderId) return;
    let cancelled = false;
    ordersApi
      .get(orderId, token)
      .then((result) => {
        if (!cancelled) setOrder(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your order.');
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, token]);

  const submitCancel = (): void => {
    if (!order || !token) return;
    setCancelling(true);
    ordersApi
      .cancel(order.id, { reason: cancelReason.trim() || undefined }, token)
      .then((updated) => setOrder(updated))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.details?.code === 'order.status_not_cancellable') {
          setError('This order can no longer be cancelled.');
        } else {
          setError(err instanceof Error ? err.message : 'Could not cancel the order.');
        }
      })
      .finally(() => {
        setCancelling(false);
        setConfirmOpen(false);
      });
  };

  if (error && !order) {
    return (
      <EmptyState
        icon={<PackageIcon className="h-8 w-8" />}
        title="Order not found"
        message={error}
        action={
          <Link
            to="/customer/orders"
            className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white"
          >
            Back to your orders
          </Link>
        }
      />
    );
  }

  if (!order) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Loading your order…</p>;
  }

  const cancellable = isCustomerCancellable(order.status);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/customer/orders" className="text-sm font-semibold text-brand-teal">
          ← Your orders
        </Link>
        <header className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold tracking-tight text-brand-navy">
            {order.orderNumber}
          </h1>
          <StatusBadge
            label={ORDER_STATUS_LABELS[order.status]}
            tone={ORDER_STATUS_TONES[order.status]}
          />
        </header>
        <p className="mt-1 text-sm text-slate-500">
          {order.branch.name} · placed {formatDateTime(order.placedAt)}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Progress</h2>
        <div className="mt-4">
          <OrderTimeline status={order.status} events={order.events} />
        </div>
      </section>

      {token ? (
        <DeliveryTrackingSection
          orderId={order.id}
          orderStatus={order.status}
          token={token}
        />
      ) : null}

      <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Items</h2>
              <ul className="mt-2 divide-y divide-slate-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {item.productName}
                    </span>
                    <span className="text-xs text-slate-500">Qty {item.quantity}</span>
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatPaise(item.lineTotalMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {order.address ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Delivering to
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {order.address.label ?? order.address.houseFlat}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {order.address.houseFlat}, {order.address.streetArea}
                {order.address.landmark ? `, ${order.address.landmark}` : ''}
                <br />
                {order.address.city} · {order.address.state} · {order.address.postalCode}
              </p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Payment</h2>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Method</dt>
                <dd>{order.payments[0] ? PAYMENT_METHOD_LABELS[order.payments[0].method] : '—'}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Status</dt>
                <dd className="font-semibold text-slate-800">
                  {order.payments[0] ? PAYMENT_STATUS_LABELS[order.payments[0].status] : '—'}
                </dd>
              </div>
              {order.payments[0]?.method === 'COD' && order.payments[0].collectedAt ? (
                <div className="flex justify-between text-slate-600">
                  <dt>Collected</dt>
                  <dd className="font-semibold text-emerald-700">
                    {formatDateTime(order.payments[0].collectedAt)}
                    {order.payments[0].collectedByRole === 'DELIVERY_PARTNER' ? ' · by partner' : ''}
                    {order.payments[0].collectedByRole === 'BRANCH_MANAGER'
                      ? ' · by branch'
                      : ''}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-brand-sky/20 p-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Item total</dt>
                <dd>{formatPaise(order.subtotalMinor)}</dd>
              </div>
              {order.discountMinor > 0 ? (
                <div className="flex justify-between text-brand-teal">
                  <dt>Discounts</dt>
                  <dd>−{formatPaise(order.discountMinor)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-slate-600">
                <dt>Delivery fee</dt>
                <dd>{formatPaise(order.deliveryFeeMinor)}</dd>
              </div>
              {order.taxMinor > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <dt>Taxes</dt>
                  <dd>{formatPaise(order.taxMinor)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between pt-1 text-base font-extrabold text-slate-900">
                <dt>Total</dt>
                <dd>{formatPaise(order.totalMinor)}</dd>
              </div>
            </dl>
          </section>
        </div>

      {cancellable ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="w-full rounded-xl border border-red-300 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 sm:w-auto"
        >
          Cancel this order
        </button>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={`Cancel ${order.orderNumber}?`}
        description="Cancelling is immediate and cannot be undone. The refund is handled manually by the branch."
        confirmLabel={cancelling ? 'Cancelling…' : 'Yes, cancel order'}
        cancelLabel="Don't cancel"
        danger
        onConfirm={submitCancel}
        onClose={() => {
          if (!cancelling) {
            setConfirmOpen(false);
            setCancelReason('');
          }
        }}
      >
        <textarea
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder="Reason (optional)"
          maxLength={200}
          rows={2}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
        />
      </ConfirmDialog>
    </section>
  );
}
