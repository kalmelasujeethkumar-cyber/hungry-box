import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { DeliveryTrackingDto, OrderStatus } from '@hungrybox/shared';
import { deliveryTrackingApi } from '../../api/client';
import { RealtimePill, useDeliveryRealtime } from '../delivery/use-delivery-realtime';
import { ASSIGNMENT_STATUS_LABELS } from '../delivery/delivery-status';
import { LocationIcon, PackageIcon } from '../storefront/components/icons';

function mapsUrlFor(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

interface DeliveryTrackingSectionProps {
  orderId: string;
  orderStatus: OrderStatus;
  token: string;
}

export default function DeliveryTrackingSection({
  orderId,
  orderStatus,
  token,
}: DeliveryTrackingSectionProps): JSX.Element {
  const [tracking, setTracking] = useState<DeliveryTrackingDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { lastEvent, refetchKey, connected } = useDeliveryRealtime();

  const isLive = ['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(
    tracking?.assignment?.status ?? '',
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    if (!orderId || !token) return;

    const load = (): void => {
      deliveryTrackingApi
        .get(orderId, token)
        .then((result) => {
          if (cancelled) return;
          setTracking(result);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Could not load delivery status.');
        });
    };

    load();
    if (orderStatus === 'OUT_FOR_DELIVERY') {
      timer = setInterval(load, 15000);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [orderId, token, orderStatus]);

  useEffect(() => {
    // Realtime is a live mirror; REST stays authoritative. Refetch when a
    // realtime event arrives for this order so the section updates instantly
    // instead of waiting for the next poll. Events for other orders are
    // ignored so a customer with several orders is not churned.
    if (!orderId || !token) return;
    if (refetchKey === 0) return;
    if (lastEvent && lastEvent.orderId !== orderId) return;
    deliveryTrackingApi.get(orderId, token).catch(() => undefined);
  }, [orderId, token, lastEvent, refetchKey]);

  if (error && !tracking) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Delivery status
        </h2>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </section>
    );
  }

  if (!tracking) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Delivery status
        </h2>
        <p className="mt-2 text-sm text-slate-500">Checking delivery status…</p>
      </section>
    );
  }

  const partner = tracking.partner;
  const location = tracking.location;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Delivery status
        </h2>
        <RealtimePill connected={connected} />
      </div>

      {!tracking.trackingAvailable || !partner ? (
        <div className="mt-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-sky text-brand-navy">
            <PackageIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Waiting for a partner</p>
            <p className="mt-0.5 text-xs text-slate-500">
              A delivery partner will be assigned once your order is ready. You’ll see them here.
            </p>
          </div>
        </div>
      ) : tracking.assignment?.status === 'DELIVERED' || orderStatus === 'DELIVERED' ? (
        <div className="mt-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <PackageIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Delivered by {partner.fullName}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Thanks for ordering with Hungry Box. Enjoy your meal!
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-sky text-brand-navy">
              {partner.profilePhotoUrl ? (
                <img src={partner.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-extrabold">
                  {partner.fullName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-brand-navy">{partner.fullName}</p>
              <p className="text-xs text-slate-500">
                {partner.vehicleType ?? 'Vehicle'} {partner.vehicleNumber ?? ''} ·{' '}
                {ASSIGNMENT_STATUS_LABELS[tracking.assignment?.status ?? 'ASSIGNED']}
              </p>
              {partner.mobile ? (
                <a
                  href={`tel:${partner.mobile}`}
                  className="mt-0.5 inline-block text-xs font-bold text-brand-teal"
                >
                  Call partner
                </a>
              ) : null}
            </div>
          </div>

          {isLive ? (
            <div
              className="flex items-start gap-3 rounded-xl bg-brand-sky/30 p-3"
              data-testid="live-location"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-white">
                <LocationIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-brand-navy">
                  {location
                    ? `About ${tracking.distanceToDestinationKm ?? '—'} km away`
                    : 'Approximate location not available'}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {location
                    ? 'The partner is moving towards you. Approximate straight-line distance.'
                    : 'Live sharing is paused. The partner is still on the way.'}
                </p>
                {location ? (
                  <a
                    href={mapsUrlFor(location.latitude, location.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-xs font-bold text-brand-teal"
                  >
                    Open in maps
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {tracking.assignment ? (
            <p className="text-xs text-slate-500">
              Assigned {new Date(tracking.assignment.assignedAt).toLocaleTimeString('en-IN')}
              {tracking.assignment.outForDeliveryAt
                ? ` · out since ${new Date(tracking.assignment.outForDeliveryAt).toLocaleTimeString('en-IN')}`
                : ''}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
