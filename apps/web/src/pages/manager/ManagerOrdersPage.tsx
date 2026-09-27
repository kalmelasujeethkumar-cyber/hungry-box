import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OrderStatus, OrderSummaryDto } from '@hungrybox/shared';
import { branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import Pagination from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { PackageIcon } from '../../features/storefront/components/icons';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '../../features/orders/order-status';
import { ORDER_STATUS_FILTERS } from '../../features/manager/manager-orders';
import { BRANCH_ORDERS_PAGE_SIZE } from '../../features/manager/manager-orders';
import { formatBusinessPlacedAt } from '../../lib/business-time';
import { formatPaise } from '../../lib/money';
import ManagerLayout from './ManagerLayout';
import { BRANCH_ORDERS_PATH } from '../../routes/paths';

export default function ManagerOrdersPage(): JSX.Element {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [total, setTotal] = useState(0);
  const status = useMemo(() => {
    const value = searchParams.get('status');
    return value && ORDER_STATUS_FILTERS.some((option) => option.value === value)
      ? (value as OrderStatus)
      : undefined;
  }, [searchParams]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * The list is paged by the server, so the page number lives in the URL. A manager who
   * filters to PREPARING, reads page 2 and then reloads or shares the link sees the same
   * rows they were looking at.
   */
  const rawPage = Number(searchParams.get('page') ?? '1');
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    branchOrdersApi
      .list(token, { status, page: requestedPage, limit: BRANCH_ORDERS_PAGE_SIZE })
      .then((result) => {
        setOrders(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => setLoading(false));
  }, [token, status, requestedPage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyStatus = (next: OrderStatus | undefined): void => {
    setSearchParams(next ? { status: next } : {}, { replace: true });
  };

  const applyPage = (next: number): void => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('page', String(next));
        return params;
      },
      { replace: true },
    );
  };

  return (
    <ManagerLayout kicker="Branch operations" title="Orders">
      <FilterChips
        className="mt-6"
        options={ORDER_STATUS_FILTERS}
        value={status}
        onChange={applyStatus}
        ariaLabel="Filter orders by status"
      />

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
            message={
              requestedPage > 1
                ? 'This page is past the end of the list. Go back to see earlier orders.'
                : 'Orders placed in your branch will appear here.'
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`${BRANCH_ORDERS_PATH}/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-teal"
              >
                <div className="min-w-0">
                  <p className="font-bold text-brand-navy">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatBusinessPlacedAt(order.placedAt)} · {order.itemCount} item
                    {order.itemCount === 1 ? '' : 's'} · {order.branch.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-brand-navy">{formatPaise(order.totalMinor)}</span>
                  <StatusBadge
                    label={ORDER_STATUS_LABELS[order.status]}
                    tone={ORDER_STATUS_TONES[order.status]}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading ? (
        <Pagination
          page={requestedPage}
          limit={BRANCH_ORDERS_PAGE_SIZE}
          total={total}
          shown={orders.length}
          onPageChange={applyPage}
          filtered={status !== undefined}
        />
      ) : null}
    </ManagerLayout>
  );
}
