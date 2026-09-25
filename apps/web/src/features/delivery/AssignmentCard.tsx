import type { JSX } from 'react';
import type { DeliveryAssignmentDto, DeliveryAssignmentListItemDto } from '@hungrybox/shared';
import { formatDateTime } from '../../lib/format';
import { formatPaise } from '../../lib/money';
import { ASSIGNMENT_STATUS_LABELS, isActiveAssignmentStatus } from './delivery-status';

const STATUS_BADGE: Record<string, string> = {
  ASSIGNED: 'bg-brand-yellow/30 text-amber-900',
  ACCEPTED: 'bg-brand-sky/60 text-brand-navy',
  PICKED_UP: 'bg-brand-sky/60 text-brand-navy',
  OUT_FOR_DELIVERY: 'bg-brand-sky/60 text-brand-navy',
  DELIVERED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600';
}

export function AssignmentCard({ assignment }: { assignment: DeliveryAssignmentDto }): JSX.Element {
  const address = assignment.order.address;
  const addressLine = address
    ? [address.houseFlat, address.streetArea, address.landmark, address.city, address.state]
        .filter(Boolean)
        .join(', ')
    : `${assignment.order.branch.name} (pickup)`;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold tracking-tight text-brand-navy">
            {assignment.order.orderNumber}
          </p>
          <p className="text-xs text-slate-500">
            Assigned {formatDateTime(assignment.assignedAt)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(assignment.status)}`}
        >
          {ASSIGNMENT_STATUS_LABELS[assignment.status]}
        </span>
      </header>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">
            {isActiveAssignmentStatus(assignment.status) && address ? 'Deliver to' : 'Branch'}
          </dt>
          <dd className="mt-0.5 font-medium text-slate-800">{addressLine}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-slate-500">Order total</dt>
          <dd className="mt-0.5 font-bold text-slate-900">{formatPaise(assignment.order.totalMinor)}</dd>
          {assignment.order.paymentMethod === 'COD' ? (
            <p
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                assignment.order.paymentStatus === 'PAID'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-brand-yellow/40 text-amber-900'
              }`}
            >
              {assignment.order.paymentStatus === 'PAID'
                ? 'Cash collected'
                : `Collect ${formatPaise(assignment.order.totalMinor)} cash`}
            </p>
          ) : null}
        </div>
      </dl>
      {assignment.notes ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
          {assignment.notes}
        </p>
      ) : null}
    </article>
  );
}

export function AssignmentListItemCard({
  assignment,
}: {
  assignment: DeliveryAssignmentListItemDto;
}): JSX.Element {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold tracking-tight text-brand-navy">{assignment.orderNumber}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {assignment.recipientName ?? assignment.addressCity ?? assignment.branchCity} ·{' '}
            {formatDateTime(assignment.assignedAt)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(assignment.status)}`}
        >
          {ASSIGNMENT_STATUS_LABELS[assignment.status]}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-slate-900">{formatPaise(assignment.totalMinor)}</p>
    </article>
  );
}