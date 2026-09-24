import { useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import type { AddressDto } from '@hungrybox/shared';
import { useCart } from '../cart-context';
import { useStorefront } from '../storefront-context';
import ConfirmDialog from './ConfirmDialog';
import { CloseIcon, LocationIcon } from './icons';

export default function LocationModal(): JSX.Element | null {
  const {
    locationsOpen,
    setLocationsOpen,
    addresses,
    branch,
    branchId,
    probeAddress,
    chooseAddress,
    detectMyLocation,
  } = useStorefront();
  const { hasItems } = useCart();
  const [detecting, setDetecting] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<{
    address: AddressDto;
    branchName: string;
  } | null>(null);

  if (!locationsOpen) return null;

  async function handleChoose(address: AddressDto): Promise<void> {
    const hasCoordinates = address.latitude !== null && address.longitude !== null;
    if (!hasCoordinates) {
      setLocationsOpen(false);
      return;
    }
    if (hasItems && branchId) {
      const result = await probeAddress(address);
      if (result?.serviceable && result.branch && result.branch.id !== branchId) {
        setPendingTarget({ address, branchName: result.branch.name });
        return;
      }
    }
    await chooseAddress(address);
    setLocationsOpen(false);
  }

  async function handleMyLocation(): Promise<void> {
    setDetecting(true);
    const ok = await detectMyLocation();
    setDetecting(false);
    if (ok) setLocationsOpen(false);
  }

  const coordAddresses = addresses.filter(
    (address) => address.latitude !== null && address.longitude !== null,
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
      onClick={() => setLocationsOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="location-modal-title" className="text-lg font-bold text-brand-navy">
            Choose delivery location
          </h2>
          <button
            type="button"
            onClick={() => setLocationsOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:text-brand-navy"
            aria-label="Close location picker"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleMyLocation()}
          disabled={detecting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-teal px-4 py-3 text-sm font-semibold text-white hover:bg-brand-teal/90 disabled:opacity-60"
        >
          <LocationIcon className="h-4 w-4" />
          {detecting ? 'Detecting…' : 'Use my current location'}
        </button>

        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Saved addresses
        </p>
        {coordAddresses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No saved address with coordinates yet.{' '}
            <Link
              to="/customer/addresses"
              onClick={() => setLocationsOpen(false)}
              className="font-semibold text-brand-teal hover:underline"
            >
              Manage addresses
            </Link>
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {addresses.map((address) => {
              const usable = address.latitude !== null && address.longitude !== null;
              return (
                <li key={address.id}>
                  <button
                    type="button"
                    disabled={!usable}
                    onClick={() => void handleChoose(address)}
                    className="flex w-full items-start gap-3 px-1 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="mt-0.5 inline-flex shrink-0 items-center rounded bg-brand-sky px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-navy">
                      {address.isDefault ? 'Default' : address.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {address.houseFlat}, {address.streetArea}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {address.city}, {address.state} {address.postalCode}
                      </span>
                      {!usable ? (
                        <span className="mt-1 block text-xs font-medium text-brand-orange">
                          No coordinates saved — edit the address to enable delivery.
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-center text-xs text-slate-400">
          Currently delivering from{' '}
          <span className="font-semibold text-slate-600">{branch ? branch.name : '…'}</span> in{' '}
          <span className="font-semibold text-slate-600">{branch ? branch.city : '…'}</span>
        </p>
      </div>

      <ConfirmDialog
        open={pendingTarget !== null}
        title="Switch delivery branch?"
        description={`Your current cart is saved in ${branch?.name ?? 'this branch'}. Switching to ${pendingTarget?.branchName ?? 'the new branch'} keeps it aside — it will still be there if you switch back. Continue?`}
        confirmLabel="Switch branch"
        onConfirm={() => {
          if (pendingTarget) {
            void chooseAddress(pendingTarget.address);
            setPendingTarget(null);
            setLocationsOpen(false);
          }
        }}
        onClose={() => setPendingTarget(null)}
      />
    </div>
  );
}
