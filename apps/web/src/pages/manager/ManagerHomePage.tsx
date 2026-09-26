import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OrderSummaryDto } from '@hungrybox/shared';
import { branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import ManagerLayout from './ManagerLayout';
import {
  MANAGER_ASSIGNMENTS_PATH,
  MANAGER_AUDIT_PATH,
  MANAGER_CATALOG_PATH,
  MANAGER_ORDERS_PATH,
  MANAGER_PARTNERS_PATH,
  MANAGER_SETTINGS_PATH,
} from '../../routes/paths';

const QUICK_LINKS = [
  {
    to: MANAGER_ORDERS_PATH,
    title: 'Orders',
    description: 'Confirm, prepare and dispatch orders, or cancel unfulfilled ones.',
  },
  {
    to: MANAGER_CATALOG_PATH,
    title: 'Catalogue',
    description: 'Manage branch prices, discounts and product availability.',
  },
  {
    to: MANAGER_PARTNERS_PATH,
    title: 'Delivery partners',
    description: 'Onboard, verify documents and manage partner availability.',
  },
  {
    to: MANAGER_ASSIGNMENTS_PATH,
    title: 'Assignments',
    description: 'Assign ready orders to online partners and track delivery progress.',
  },
  {
    to: MANAGER_SETTINGS_PATH,
    title: 'Settings',
    description: 'Update the delivery radius and branch address.',
  },
  {
    to: MANAGER_AUDIT_PATH,
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
            to={`${MANAGER_ORDERS_PATH}?status=PLACED`}
            accent="text-brand-orange"
          />
          <StatCard
            label="Preparing"
            count={preparing}
            to={`${MANAGER_ORDERS_PATH}?status=PREPARING`}
            accent="text-brand-navy"
          />
          <StatCard
            label="Ready for pickup"
            count={ready}
            to={`${MANAGER_ORDERS_PATH}?status=READY_FOR_PICKUP`}
            accent="text-brand-teal"
          />
          <StatCard
            label="Out for delivery"
            count={live}
            to={`${MANAGER_ORDERS_PATH}?status=OUT_FOR_DELIVERY`}
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
