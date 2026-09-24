import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  DeliveryAssignmentDto,
  DeliveryAssignmentListItemDto,
  DeliveryPartnerProfileDto,
} from '@hungrybox/shared';
import { deliveryPartnerApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import AssignmentActionPanel from '../../features/delivery/AssignmentActionPanel';
import { AssignmentCard, AssignmentListItemCard } from '../../features/delivery/AssignmentCard';
import { AVAILABILITY_LABELS, isActiveAssignmentStatus } from '../../features/delivery/delivery-status';
import { useDeliveryRealtime } from '../../features/delivery/use-delivery-realtime';
import EmptyState from '../../features/storefront/components/EmptyState';
import { LocationIcon, PackageIcon } from '../../features/storefront/components/icons';
import { formatDateOnly } from '../../lib/format';

export default function DeliveryHomePage(): JSX.Element {
  const { token } = useAuth();
  const { refetchKey } = useDeliveryRealtime();
  const [profile, setProfile] = useState<DeliveryPartnerProfileDto | null>(null);
  const [active, setActive] = useState<DeliveryAssignmentListItemDto[]>([]);
  const [activeDetail, setActiveDetail] = useState<DeliveryAssignmentDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    Promise.all([
      deliveryPartnerApi.profile(token),
      deliveryPartnerApi.myAssignments(token),
    ])
      .then(([profileResult, assignments]) => {
        setProfile(profileResult);
        const activeItems = assignments.filter((item) => isActiveAssignmentStatus(item.status));
        setActive(activeItems);
        if (activeItems.length > 0) {
          return deliveryPartnerApi
            .getAssignment(activeItems[0].id, token)
            .then(setActiveDetail)
            .catch(() => setActiveDetail(null));
        }
        setActiveDetail(null);
        return undefined;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
      });
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh, refetchKey]);

  const toggleAvailability = (): void => {
    if (!profile || !token) return;
    const next = profile.availability === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    setToggling(true);
    deliveryPartnerApi
      .setAvailability(next, token)
      .then((updated) => setProfile(updated))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not update availability.');
      })
      .finally(() => setToggling(false));
  };

  if (error && !profile) {
    return (
      <EmptyState
        icon={<PackageIcon className="h-8 w-8" />}
        title="Dashboard unavailable"
        message={error}
      />
    );
  }

  if (!profile) {
    return <p className="py-16 text-center text-sm text-slate-500">Loading your dashboard…</p>;
  }

  const offline = profile.availability === 'OFFLINE';

  return (
    <section className="space-y-4">
      <header className="rounded-2xl bg-brand-navy p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-sky">
          Delivery partner · {profile.branch.name}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Hi {profile.fullName}</h1>
        <p className="mt-1 text-xs text-brand-sky">ID {profile.partnerId}</p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-brand-navy">Availability</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {AVAILABILITY_LABELS[profile.availability]}
              {profile.wentOnlineAt
                ? ` since ${formatDateOnly(profile.wentOnlineAt)}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={toggling || profile.availability === 'ON_DELIVERY'}
            onClick={toggleAvailability}
            aria-pressed={profile.availability === 'ONLINE'}
            className={
              profile.availability === 'ONLINE'
                ? 'rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50'
                : 'rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50'
            }
          >
            {toggling
              ? 'Updating…'
              : profile.availability === 'ONLINE'
                ? 'Go offline'
                : 'Go online'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Your delivery</h2>
        {active.length === 0 ? (
          <EmptyState
            icon={<LocationIcon className="h-8 w-8" />}
            title={offline ? 'You are offline' : 'No active delivery'}
            message={
              offline
                ? 'Go online to receive delivery requests in your branch area.'
                : 'New delivery requests will appear here. Keep the app open while online.'
            }
          />
        ) : activeDetail ? (
          <div className="space-y-3">
            <AssignmentCard assignment={activeDetail} />
            <AssignmentActionPanel assignment={activeDetail} token={token ?? ''} onChanged={refresh} />
          </div>
        ) : (
          active.map((assignment) => (
            <div key={assignment.id} className="space-y-3">
              <AssignmentListItemCard assignment={assignment} />
            </div>
          ))
        )}
      </section>
    </section>
  );
}