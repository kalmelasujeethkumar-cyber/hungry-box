import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { OrderDetailDto } from '@hungrybox/shared';
import { ApiError, branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { LoadingState } from '../../components/LoadingState';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
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
import { BRANCH_ORDERS_PATH } from '../../routes/paths';

function eventLabel(kind: string): string {
  switch (kind) {
    case 'ORDER_CREATED':
      return 'Order placed';
    case 'STATUS_CHANGED':
      return 'Status changed';
    case 'ORDER_CANCELLED':
      return 'Cancelled';
    case 'COD_ORDER_CREATED':
      return 'Order placed (cash on delivery)';
    case 'COD_COLLECTED':
      return 'Cash collected by partner';
    case 'COD_COLLECTION_CORRECTED':
      return 'Cash collection recorded by branch';
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
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectReason, setCollectReason] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);

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
        {error ? (
          <Notice tone="error" className="mt-6">
            {error}
          </Notice>
        ) : null}
        {!error ? <LoadingState message="Loading order…" className="mt-8" /> : null}
      </ManagerLayout>
    );
  }

  const advanceTarget = staffAdvanceTarget(order.status);
  const canCancel = staffCancellable(order.status);

  const advance = (): void => {
    if (!token || !advanceTarget || busy) return;
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
    if (!token || busy) return;
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

  const codPaymentPending = order.payments.find(
    (payment) => payment.method === 'COD' && payment.status === 'PENDING',
  );

  const collect = (): void => {
    if (!token || !codPaymentPending || busy) return;
    const reason = collectReason.trim();
    if (!reason) {
      setCollectError('Reason is required to record the collection.');
      return;
    }
    setBusy(true);
    setError(null);
    setCollectError(null);
    branchOrdersApi
      .collectCod(order.id, reason, token)
      .then(setOrder)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not record the collection.'),
      )
      .finally(() => {
        setBusy(false);
        setCollectOpen(false);
        setCollectReason('');
      });
  };

  return (
    <ManagerLayout kicker="Branch operations" title={order.orderNumber}>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge
                label={ORDER_STATUS_LABELS[order.status]}
                tone={ORDER_STATUS_TONES[order.status]}
              />
              <span className="text-xs text-slate-500">
                Placed {new Date(order.placedAt).toLocaleString('en-IN')}
              </span>
            </div>
            {error ? (
              <Notice tone="error" className="mt-3">
                {error}
              </Notice>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {advanceTarget ? (
                <Button onClick={advance} loading={busy} loadingLabel="Working…">
                  {nextStatusLabel(order.status)}
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="dangerOutline" onClick={() => setCancelOpen(true)} disabled={busy}>
                  Cancel order
                </Button>
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
                {payment.method === 'COD' && payment.status === 'PAID' && payment.collectedAt ? (
                  <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                    Collected {new Date(payment.collectedAt).toLocaleString('en-IN')}
                    {payment.collectedByRole === 'DELIVERY_PARTNER' ? ' · by partner' : ''}
                    {payment.collectedByRole === 'BRANCH_MANAGER' ? ' · by branch' : ''}
                  </p>
                ) : null}
              </div>
            ))}
            {codPaymentPending ? (
              <Button
                variant="accent"
                className="mt-3"
                onClick={() => setCollectOpen(true)}
                disabled={busy}
              >
                Cash collected — record it
              </Button>
            ) : null}
          </section>

          <Link
            to={BRANCH_ORDERS_PATH}
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
        busy={busy && cancelOpen}
        busyLabel="Cancelling…"
        onConfirm={cancel}
        onClose={() => setCancelOpen(false)}
      />
      <ConfirmDialog
        open={collectOpen}
        title="Record cash collection"
        description={`Mark the ${formatPaise(order.totalMinor)} cash-on-delivery payment for ${order.orderNumber} as collected.`}
        confirmLabel="Mark as collected"
        busy={busy && collectOpen}
        busyLabel="Recording…"
        onConfirm={collect}
        onClose={() => {
          setCollectOpen(false);
          setCollectReason('');
          setCollectError(null);
        }}
      >
        {collectError ? (
          <Notice tone="error" className="mt-3">
            {collectError}
          </Notice>
        ) : null}
        <textarea
          value={collectReason}
          onChange={(event) => {
            setCollectReason(event.target.value);
            setCollectError(null);
          }}
          placeholder="Reason (required) — e.g. cash was collected, app failed during final step"
          maxLength={300}
          rows={2}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
        />
      </ConfirmDialog>
    </ManagerLayout>
  );
}
