import type { JSX } from 'react';
import { useState } from 'react';
import type { DeliveryAssignmentDto } from '@hungrybox/shared';
import { ApiError, deliveryPartnerApi } from '../../api/client';
import ConfirmDialog from '../storefront/components/ConfirmDialog';

function mapsUrlFor(address: DeliveryAssignmentDto['order']['address']): string {
  if (!address) return 'https://www.google.com/maps';
  const query = [address.houseFlat, address.streetArea, address.landmark, address.city, address.state]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function AssignmentActionPanel({
  assignment,
  token,
  onChanged,
}: {
  assignment: DeliveryAssignmentDto;
  token: string;
  onChanged: () => void;
}): JSX.Element | null {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const run = (action: () => Promise<DeliveryAssignmentDto>): void => {
    setBusy(action.name);
    setError(null);
    action()
      .then(onChanged)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.details?.code === 'delivery.already_handled') {
          setError('This assignment is no longer waiting for you — it may have been updated elsewhere.');
        } else if (err instanceof ApiError && err.details?.code === 'delivery.wrong_state') {
          setError('This action is not allowed for the current delivery state.');
        } else {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
        onChanged();
      })
      .finally(() => setBusy(null));
  };

  const confirmReject = (): void => {
    const reason = rejectReason.trim();
    if (!reason) {
      setError('Please add a short reason before rejecting.');
      return;
    }
    run(() => deliveryPartnerApi.reject(assignment.id, reason, token));
    setRejectOpen(false);
    setRejectReason('');
  };

  const primary =
    assignment.status === 'OUT_FOR_DELIVERY'
      ? {
          label: 'Mark as delivered',
          run: () => deliveryPartnerApi.deliver(assignment.id, token),
        }
      : assignment.status === 'PICKED_UP'
        ? { label: 'Start delivery', run: () => deliveryPartnerApi.outForDelivery(assignment.id, token) }
        : assignment.status === 'ACCEPTED'
          ? { label: 'Mark picked up', run: () => deliveryPartnerApi.pickup(assignment.id, token) }
          : null;

  if (assignment.status === 'ASSIGNED') {
    return (
      <div className="rounded-2xl border border-brand-yellow/60 bg-brand-yellow/10 p-4">
        {error ? <p className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}
        <p className="text-sm font-bold text-brand-navy">Do you want this delivery?</p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run(() => deliveryPartnerApi.accept(assignment.id, token))}
            className="flex-1 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept delivery'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setRejectOpen(true)}
            className="flex-1 rounded-xl border border-red-300 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
        <ConfirmDialog
          open={rejectOpen}
          title="Reject this delivery?"
          description="The assignment will be returned for another partner. Please give a short reason."
          confirmLabel="Reject delivery"
          cancelLabel="Keep it"
          danger
          onConfirm={confirmReject}
          onClose={() => setRejectOpen(false)}
        >
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Reason (e.g. distance too far, vehicle issue)"
            maxLength={200}
            rows={2}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
          />
        </ConfirmDialog>
      </div>
    );
  }

  if (!primary) return null;

  const navigate =
    ['OUT_FOR_DELIVERY', 'PICKED_UP', 'ACCEPTED'].includes(assignment.status) && assignment.order.address;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      {error ? <p className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run(primary.run)}
          className="flex-1 rounded-xl bg-brand-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : primary.label}
        </button>
        {navigate ? (
          <a
            href={mapsUrlFor(assignment.order.address)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 rounded-xl border border-brand-teal px-4 py-3 text-center text-sm font-bold text-brand-teal hover:bg-brand-sky/40"
          >
            Navigate
          </a>
        ) : null}
      </div>
    </div>
  );
}