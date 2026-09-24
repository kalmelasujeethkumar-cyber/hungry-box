import type { JSX } from 'react';
import { useStorefront } from '../storefront-context';
import { LocationIcon } from './icons';

export default function LocationBanner(): JSX.Element | null {
  const { status, setLocationsOpen } = useStorefront();

  if (status !== 'idle' && status !== 'error') return null;

  return (
    <div className="rounded-2xl border border-brand-sky bg-brand-sky/60 p-5">
      <div className="flex items-center gap-3">
        <LocationIcon className="h-6 w-6 text-brand-navy" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-brand-navy">Where should we deliver?</h2>
          <p className="text-sm text-slate-700">
            {status === 'error'
              ? 'We could not fetch your location. Choose a saved address instead.'
              : 'Share your location or pick a saved address to see the menu.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setLocationsOpen(true)}
        className="mt-4 w-full rounded-lg bg-brand-navy px-4 py-3 text-sm font-bold text-white hover:bg-brand-navy/90"
      >
        Set delivery location
      </button>
    </div>
  );
}
