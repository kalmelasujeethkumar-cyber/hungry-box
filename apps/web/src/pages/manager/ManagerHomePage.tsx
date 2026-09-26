import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OrderSummaryDto } from '@hungrybox/shared';
import { branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import ManagerLayout from './ManagerLayout';

const QUICK_LINKS = [
  {
    to: '/manager/orders',
    title: 'Orders',
    description: 'Confirm, prepare and dispatch orders, or cancel unfulfilled ones.',
  },
  {
    to: '/manager/catalog',
    title: 'Catalogue',
    description: 'Manage branch prices, discounts and product availability.',
  },
  {
    to: '/manager/partners',
    title: 'Delivery partners',
    description: 'Onboard, verify documents and manage partner availability.',
  },
  {
    to: '/manager/assignments',
    title: 'Assignments',
    description: 'Assign ready orders to online partners and track delivery progress.',
  },
  {
    to: '/manager/settings',
    title: 'Settings',
    description: 'Update the delivery radius and branch address.',
  },
  {
    to: '/manager/audit',
    title: 'Audit log',
    description: 'Review branch activity and export a CSV trail.',
  },
] as const;

function StatCard({
  label,
  count,
  to,
  accent,
}: {
  label: string;
  count: number;
  to: string;
  accent: string;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-brand-teal"
    >
      <p className={`text-3xl font-extrabold ${accent}`}>{count}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
    </Link>
  );
}

export default function ManagerHomePage(): JSX.Element {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    branchOrdersApi
      .list(token)
      .then(setOrders)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load branch activity.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const countBy = (statuses: OrderSummaryDto['status'][]): number =>
    orders.filter((order) => statuses.includes(order.status)).length;

  const newOrders = countBy(['PLACED']);
  const preparing = countBy(['CONFIRMED', 'PREPARING']);
  const ready = countBy(['READY_FOR_PICKUP']);
  const live = countBy(['OUT_FOR_DELIVERY']);

  return (
    <ManagerLayout kicker="Branch operations" title={`Overview · ${user?.name ?? 'Manager'}`}>
      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {loading ? (
        <LoadingState message="Loading branch overview…" className="mt-10" />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="New orders"
            count={newOrders}
            to="/manager/orders?status=PLACED"
            accent="text-brand-orange"
          />
          <StatCard
            label="Preparing"
            count={preparing}
            to="/manager/orders?status=PREPARING"
            accent="text-brand-navy"
          />
          <StatCard
            label="Ready for pickup"
            count={ready}
            to="/manager/orders?status=READY_FOR_PICKUP"
            accent="text-brand-teal"
          />
          <StatCard
            label="Out for delivery"
            count={live}
            to="/manager/orders?status=OUT_FOR_DELIVERY"
            accent="text-yellow-600"
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-brand-teal"
          >
            <h2 className="text-lg font-extrabold text-brand-navy">{link.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{link.description}</p>
          </Link>
        ))}
      </div>
    </ManagerLayout>
  );
}
