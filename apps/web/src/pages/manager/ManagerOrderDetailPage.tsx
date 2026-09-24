import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { OrderDetailDto } from '@hungrybox/shared';
import { ApiError, branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../features/orders/order-status';
import {
  nextStatusLabel,
  staffAdvanceTarget,
  staffCancellable,
} from '../../features/manager/manager-orders';
import { formatPaise } from '../../lib/money';
import ManagerLayout from './ManagerLayout';

function eventLabel(kind: string): string {
  switch (kind) {
    case 'ORDER_CREATED':
      return 'Order placed';
    case 'STATUS_CHANGED':
      return 'Status changed';
    case 'ORDER_CANCELLED':
      return 'Cancelled';
    default:
      return kind.replace(/_/g, ' ').toLowerCase();
  }
}

export default function ManagerOrderDetailPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!token || !orderId) return;
    branchOrdersApi
      .get(orderId, token)
      .then(setOrder)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load this order.');
      });
  }, [token, orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!order) {
    return (
      <ManagerLayout kicker="Branch operations" title="Order">
        {error ? <p className="mt-6 text-sm font-semibold text-red-600">{error}</p> : null}
        <p className="mt-6 text-sm text-slate-500">Loading order…</p>
      </ManagerLayout>
    );
  }

  const advanceTarget = staffAdvanceTarget(order.status);
  const canCancel = staffCancellable(order.status);

  const advance = (): void => {
    if (!token || !advanceTarget) return;
    setBusy(true);
    setError(null);
    branchOrdersApi
      .advanceStatus(order.id, advanceTarget, token)
      .then(setOrder)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not update the order.'),
      )
      .finally(() => setBusy(false));
  };

  const cancel = (): void => {
    if (!token) return;
    setBusy(true);
    setError(null);
    branchOrdersApi
      .cancel(order.id, undefined, token)
      .then(setOrder)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not cancel the order.'),
      )
      .finally(() => {
        setBusy(false);
        setCancelOpen(false);
      });
  };

  return (
    <ManagerLayout kicker="Branch operations" title={order.orderNumber}>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-brand-sky/60 px-3 py-1 text-sm font-bold text-brand-navy">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
              <span className="text-xs text-slate-500">
                Placed {new Date(order.placedAt).toLocaleString('en-IN')}
              </span>
            </div>
            {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {advanceTarget ? (
                <button
                  type="button"
                  onClick={advance}
                  disabled={busy}
                  className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-50"
                >
                  {nextStatusLabel(order.status)}
                </button>
              ) : null}
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  disabled={busy}
                  className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel order
                </button>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Items</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-semibold text-brand-navy">{item.productName}</p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} × {formatPaise(item.unitEffectivePriceMinor)}
                    </p>
                  </div>
                  <p className="font-semibold text-brand-navy">
                    {formatPaise(item.lineTotalMinor)}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt>
                <dd>{formatPaise(order.subtotalMinor)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Discount</dt>
                <dd>-{formatPaise(order.discountMinor)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Delivery fee</dt>
                <dd>{formatPaise(order.deliveryFeeMinor)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Taxes</dt>
                <dd>{formatPaise(order.taxMinor)}</dd>
              </div>
              <div className="flex justify-between pt-1 text-base font-extrabold text-brand-navy">
                <dt>Total</dt>
                <dd>{formatPaise(order.totalMinor)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Timeline</h2>
            <ul className="mt-3 space-y-2">
              {[...order.events].reverse().map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-700">{eventLabel(event.kind)}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(event.at).toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          {order.address ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Delivery address
              </h2>
              <p className="mt-3 text-sm font-semibold text-brand-navy">
                {order.address.recipientName}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {order.address.houseFlat}, {order.address.streetArea}
              </p>
              <p className="text-sm text-slate-600">
                {order.address.city}, {order.address.state} - {order.address.postalCode}
              </p>
              {order.address.phone ? (
                <p className="mt-1 text-sm text-slate-600">{order.address.phone}</p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Payment</h2>
            {order.payments.map((payment) => (
              <div key={payment.id} className="mt-3 text-sm">
                <p className="font-semibold text-brand-navy">
                  {PAYMENT_METHOD_LABELS[payment.method]} · {formatPaise(payment.amountMinor)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {PAYMENT_STATUS_LABELS[payment.status]}
                </p>
              </div>
            ))}
          </section>

          <Link
            to="/manager/orders"
            className="block rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-600 hover:border-brand-teal hover:text-brand-teal"
          >
            Back to orders
          </Link>
        </aside>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this order?"
        description={`${order.orderNumber} will be cancelled and the customer will be notified.`}
        confirmLabel="Cancel order"
        danger
        onConfirm={cancel}
        onClose={() => setCancelOpen(false)}
      />
    </ManagerLayout>
  );
}
