import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { BranchDto } from '@hungrybox/shared';
import { ApiError, branchSettingsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/forms/TextField';
import { TextareaField } from '../../components/forms/TextareaField';
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
            <TextField
              label="Delivery radius (km)"
              type="number"
              min={1}
              max={50}
              step={0.5}
              value={deliveryRadiusKm}
              onChange={(event) => setDeliveryRadiusKm(Number(event.target.value))}
              className="mt-1"
            />
            <p className="mt-2 text-xs text-slate-500">
              Orders are only accepted from addresses inside this radius, measured from the branch
              location.
            </p>
            <TextareaField
              label="Branch address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1"
            />
            {error ? <Notice tone="error">{error}</Notice> : null}
            {notice ? <Notice tone="success">{notice}</Notice> : null}
            <Button
              onClick={save}
              disabled={busy}
              loading={busy}
              loadingLabel="Saving…"
              className="mt-5"
            >
              Save settings
            </Button>
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
      ) : error ? (
        <Notice tone="error">{error}</Notice>
      ) : (
        <LoadingState message="Loading settings" />
      )}
    </ManagerLayout>
  );
}
