import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { OrderDetailDto } from '@hungrybox/shared';
import { ordersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../features/storefront/components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import { formatPaise } from '../../lib/money';

export default function OrderSuccessPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return (
      <EmptyState
        icon={<PackageIcon className="h-8 w-8" />}
        title="Order looks hard to find"
        message={error}
        action={
          <Link
            to="/customer/orders"
            className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white"
          >
            Your orders
          </Link>
        }
      />
    );
  }

  if (!order) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Loading your order…</p>;
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-teal">
          Order confirmed
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-brand-navy">
          We’re on it!
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Your order <span className="font-bold text-slate-800">{order.orderNumber}</span> has been
          placed with {order.branch.name}. You will receive a confirmation from the branch shortly.
        </p>
        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3 text-left">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Delivering to</dt>
            <dd className="mt-1 font-semibold text-slate-800">
              {order.address
                ? `${order.address.houseFlat}, ${order.address.streetArea}`
                : 'Saved address'}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-left">
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              To pay on delivery page
            </dt>
            <dd className="mt-1 font-semibold text-slate-800">{formatPaise(order.totalMinor)}</dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to={`/customer/orders/${order.id}`}
            className="flex-1 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange/90"
          >
            View order &amp; tracking
          </Link>
          <Link
            to="/customer/storefront"
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
          >
            Continue browsing
          </Link>
        </div>
      </div>
    </section>
  );
}
