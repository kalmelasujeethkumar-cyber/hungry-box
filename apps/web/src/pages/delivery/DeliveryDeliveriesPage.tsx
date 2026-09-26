import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { DeliveryAssignmentListItemDto, DeliveryAssignmentStatus } from '@hungrybox/shared';
import { deliveryPartnerApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { AssignmentListItemCard } from '../../features/delivery/AssignmentCard';
import { ASSIGNMENT_STATUS_LABELS } from '../../features/delivery/delivery-status';
import EmptyState from '../../components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';

const FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'ASSIGNED', label: 'New' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

export default function DeliveryDeliveriesPage(): JSX.Element {
  const { token } = useAuth();
  const [assignments, setAssignments] = useState<DeliveryAssignmentListItemDto[]>([]);
  const [filter, setFilter] = useState<DeliveryAssignmentStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    deliveryPartnerApi
      .myAssignments(token, filter)
      .then(setAssignments)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load deliveries.');
      });
  }, [token, filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-brand-navy">Deliveries</h1>
        <p className="mt-1 text-sm text-slate-500">Your delivery history and open requests.</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter deliveries">
        {FILTERS.map((item) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={
              filter === item.value
                ? 'whitespace-nowrap rounded-full bg-brand-teal px-3.5 py-1.5 text-xs font-bold text-white'
                : 'whitespace-nowrap rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={<PackageIcon className="h-8 w-8" />}
          title="No deliveries here"
          message={
            filter
              ? `No ${ASSIGNMENT_STATUS_LABELS[filter].toLowerCase()} deliveries yet.`
              : 'Deliveries you accept or reject will show up here.'
          }
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((assignment) => (
            <AssignmentListItemCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      )}
    </section>
  );
}