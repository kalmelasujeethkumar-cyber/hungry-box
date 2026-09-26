import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  DeliveryAssignmentListItemDto,
  DeliveryAssignmentStatus,
  DeliveryPartnerCandidateDto,
  OrderSummaryDto,
} from '@hungrybox/shared';
import { branchDeliveryApi, branchOrdersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { AssignmentListItemCard, statusBadgeClass } from '../../features/delivery/AssignmentCard';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import { formatPaise } from '../../lib/money';
import ManagerLayout from './ManagerLayout';

const FILTERS = [
  { value: undefined, label: 'In progress' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

export default function ManagerAssignmentsPage(): JSX.Element {
  const { token } = useAuth();
  const [assignments, setAssignments] = useState<DeliveryAssignmentListItemDto[]>([]);
  const [filter, setFilter] = useState<DeliveryAssignmentStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [candidates, setCandidates] = useState<DeliveryPartnerCandidateDto[]>([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedPartner, setSelectedPartner] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    branchDeliveryApi
      .listAssignments(token, filter)
      .then(setAssignments)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load assignments.');
      });
  }, [token, filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openAssign = (): void => {
    setError(null);
    setSuccess(null);
    setAssignOpen(true);
    if (!token) return;
    Promise.all([
      branchOrdersApi.list(token, 'READY_FOR_PICKUP'),
      branchDeliveryApi.candidates(token),
    ])
      .then(([readyOrders, partnerCandidates]) => {
        setOrders(readyOrders);
        setCandidates(partnerCandidates);
        setSelectedOrder(readyOrders[0]?.id ?? '');
        setSelectedPartner('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the assign dialog.'));
  };

  const submitAssign = (): void => {
    if (!token || !selectedOrder || !selectedPartner) {
      setError('Choose an order and a partner first.');
      return;
    }
    setAssigning(true);
    setError(null);
    branchDeliveryApi
      .assign(selectedOrder, { deliveryPartnerId: selectedPartner }, token)
      .then(() => {
        setAssignOpen(false);
        setSelectedOrder('');
        setSelectedPartner('');
        setSuccess('Delivery assigned. The partner has been notified.');
        refresh();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Assignment failed.'))
      .finally(() => setAssigning(false));
  };

  return (
    <ManagerLayout kicker="Branch operations" title="Assignments">
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.label}
              type="button"
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
        <button
          type="button"
          onClick={openAssign}
          className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange/90"
        >
          Assign ready order
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {assignments.length === 0 ? (
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No assignments here"
            message="Assign a ready order to an online delivery partner to get started."
          />
        ) : (
          assignments.map((assignment) => (
            <AssignmentListItemCard key={assignment.id} assignment={assignment} />
          ))
        )}
      </div>

      <ConfirmDialog
        open={assignOpen}
        title="Assign a ready order"
        description="Choose an order that is ready for pickup and an online partner to deliver it."
        confirmLabel={assigning ? 'Assigning…' : 'Assign delivery'}
        cancelLabel="Cancel"
        onConfirm={submitAssign}
        onClose={() => !assigning && setAssignOpen(false)}
      >
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500" htmlFor="assign-order">
              Order
            </label>
            <select
              id="assign-order"
              value={selectedOrder}
              onChange={(event) => setSelectedOrder(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
            >
              {orders.length === 0 ? <option value="">No ready orders</option> : null}
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {formatPaise(order.totalMinor)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500" htmlFor="assign-partner">
              Partner
            </label>
            <select
              id="assign-partner"
              value={selectedPartner}
              onChange={(event) => setSelectedPartner(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
            >
              {candidates.length === 0 ? <option value="">No online partners</option> : null}
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName}
                  {candidate.distanceKm !== null ? ` · ${candidate.distanceKm} km` : ''}
                  {candidate.activeDeliveryCount > 0 ? ` · ${candidate.activeDeliveryCount} active` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {candidates.length === 0 ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass('ASSIGNED')}`}>
              No online partners right now
            </span>
          ) : null}
          {candidates.map((candidate) => (
            <span
              key={candidate.id}
              className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500"
            >
              {candidate.availability}
            </span>
          ))}
        </div>
      </ConfirmDialog>
    </ManagerLayout>
  );
}