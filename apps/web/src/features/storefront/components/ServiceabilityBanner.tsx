import type { JSX } from 'react';
import { useStorefront } from '../storefront-context';
import { LocationIcon } from './icons';

export default function ServiceabilityBanner(): JSX.Element | null {
  const { status, distanceKm, setLocationsOpen } = useStorefront();

  if (status !== 'unserviceable') return null;

  return (
    <div className="rounded-2xl border border-brand-orange/40 bg-brand-orange/10 p-5" role="alert">
      <div className="flex items-center gap-3">
        <LocationIcon className="h-6 w-6 text-brand-orange" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-800">Out of delivery range</h2>
          <p className="text-sm text-slate-700">
            {distanceKm !== null
              ? `You are about ${Math.round(distanceKm)} km away. Try a different address or another saved location.`
              : 'This location is not serviceable yet. Try a different address.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setLocationsOpen(true)}
        className="mt-4 w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange/90"
      >
        Change delivery location
      </button>
    </div>
  );
}
