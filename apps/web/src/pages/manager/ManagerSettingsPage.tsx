import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { BranchDto } from '@hungrybox/shared';
import { ApiError, branchSettingsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ManagerLayout from './ManagerLayout';

export default function ManagerSettingsPage(): JSX.Element {
  const { token, user } = useAuth();
  const [branch, setBranch] = useState<BranchDto | null>(null);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(10);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    branchSettingsApi
      .get(token, user?.branchId)
      .then((data) => {
        setBranch(data);
        setDeliveryRadiusKm(Number(data.deliveryRadiusKm));
        setAddress(data.address ?? '');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load branch settings.');
      });
  }, [token, user?.branchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = (): void => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    branchSettingsApi
      .update({ deliveryRadiusKm, address: address.trim() || undefined }, token, user?.branchId)
      .then((updated) => {
        setBranch(updated);
        setNotice('Settings saved.');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not save the settings.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <ManagerLayout kicker="Branch operations" title="Branch settings">
      {branch ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Delivery configuration
            </h2>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Delivery radius (km)
              <input
                type="number"
                min={1}
                max={50}
                step={0.5}
                value={deliveryRadiusKm}
                onChange={(event) => setDeliveryRadiusKm(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Orders are only accepted from addresses inside this radius. The radius is stored as
              branch configuration, not a constant.
            </p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Branch address
              <textarea
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
            {notice ? (
              <p className="mt-3 text-sm font-semibold text-emerald-600">{notice}</p>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="mt-5 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-50"
            >
              Save settings
            </button>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Branch</h2>
              <p className="mt-3 text-lg font-extrabold text-brand-navy">{branch.name}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                {branch.code} · {branch.city}, {branch.state}
              </p>
              <p className="mt-3 text-sm text-slate-600">{branch.address ?? 'No address set'}</p>
            </section>
          </aside>
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">{error ?? 'Loading settings…'}</p>
      )}
    </ManagerLayout>
  );
}
