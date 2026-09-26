import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import type {
  AddressDto,
  AddressLabel,
  CreateAddressInput,
  UpdateAddressInput,
} from '@hungrybox/shared';
import { addressApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import { AddressIcon, CloseIcon } from '../../features/storefront/components/icons';
import { useStorefront } from '../../features/storefront/storefront-context';

type FormState = {
  label: string;
  recipientName: string;
  phone: string;
  houseFlat: string;
  streetArea: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  deliveryInstructions: string;
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  label: 'HOME',
  recipientName: '',
  phone: '',
  houseFlat: '',
  streetArea: '',
  landmark: '',
  city: '',
  state: '',
  postalCode: '',
  latitude: '',
  longitude: '',
  deliveryInstructions: '',
  isDefault: false,
};

function toForm(address: AddressDto): FormState {
  return {
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone ?? '',
    houseFlat: address.houseFlat,
    streetArea: address.streetArea,
    landmark: address.landmark ?? '',
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude === null ? '' : String(address.latitude),
    longitude: address.longitude === null ? '' : String(address.longitude),
    deliveryInstructions: address.deliveryInstructions ?? '',
    isDefault: address.isDefault,
  };
}

export default function AddressesPage(): JSX.Element {
  const { token } = useAuth();
  const { addresses, refreshAddresses } = useStorefront();
  const [editing, setEditing] = useState<{ address: AddressDto | null } | null>(null);
  const [deleting, setDeleting] = useState<AddressDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    await refreshAddresses();
  }, [refreshAddresses]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(input: CreateAddressInput | UpdateAddressInput, id?: string): Promise<void> {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (id) {
        await addressApi.update(id, input, token);
      } else {
        await addressApi.create(input as CreateAddressInput, token);
      }
      setEditing(null);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save address');
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(address: AddressDto): Promise<void> {
    if (!token) return;
    setError(null);
    try {
      await addressApi.setDefault(address.id, token);
      await refresh();
    } catch (setErrorCaught) {
      setError(
        setErrorCaught instanceof Error ? setErrorCaught.message : 'Could not update address',
      );
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!token || !deleting) return;
    setBusy(true);
    setError(null);
    try {
      await addressApi.delete(deleting.id, token);
      setDeleting(null);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete address');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">
            Saved addresses
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pick a default for faster delivery every time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ address: null })}
          className="rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-orange/90"
        >
          Add address
        </button>
      </div>

      {error ? (
        <div
          className="mt-4 rounded-xl border border-brand-orange/40 bg-brand-orange/10 p-3 text-sm font-semibold text-slate-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {addresses.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
          <EmptyState
            icon={<AddressIcon className="h-8 w-8" />}
            title="No saved addresses"
            message="Add your home or work address to make ordering faster."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-sky px-1.5 py-0.5 text-[11px] font-bold uppercase text-brand-navy">
                    {address.label}
                  </span>
                  {address.isDefault ? (
                    <span className="rounded bg-brand-yellow px-1.5 py-0.5 text-[11px] font-bold uppercase text-slate-800">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  {address.houseFlat}, {address.streetArea}
                </p>
                <p className="text-xs text-slate-500">
                  {address.city}, {address.state} {address.postalCode}
                </p>
                {address.landmark ? (
                  <p className="mt-1 text-xs text-slate-500">Landmark: {address.landmark}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {!address.isDefault ? (
                  <button
                    type="button"
                    onClick={() => void setDefault(address)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
                  >
                    Set default
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditing({ address })}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(address)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-orange hover:text-brand-orange"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AddressForm
          address={editing.address}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this address?"
        description={`${deleting?.houseFlat ?? ''}, ${deleting?.streetArea ?? ''} will be removed. You can add it back anytime.`}
        confirmLabel="Delete address"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}

function AddressForm({
  address,
  busy,
  onSave,
  onClose,
}: {
  address: AddressDto | null;
  busy: boolean;
  onSave: (input: CreateAddressInput | UpdateAddressInput, id?: string) => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const [form, setForm] = useState<FormState>(address ? toForm(address) : EMPTY_FORM);
  const [localError, setLocalError] = useState<string | null>(null);

  function setField(field: keyof FormState, value: string | boolean): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(): Promise<void> {
    const required: Array<keyof FormState> = [
      'recipientName',
      'houseFlat',
      'streetArea',
      'city',
      'state',
      'postalCode',
    ];
    const missing = required.find((field) => String(form[field]).trim() === '');
    if (missing) {
      setLocalError('Please fill in all the required fields before saving.');
      return;
    }
    const latitude = form.latitude.trim() === '' ? null : Number(form.latitude);
    const longitude = form.longitude.trim() === '' ? null : Number(form.longitude);
    if (
      (form.latitude.trim() !== '' &&
        (Number.isNaN(latitude) || latitude! < -90 || latitude! > 90)) ||
      (form.longitude.trim() !== '' &&
        (Number.isNaN(longitude) || longitude! < -180 || longitude! > 180))
    ) {
      setLocalError(
        'Coordinates look invalid. Latitude is -90 to 90 and longitude is -180 to 180.',
      );
      return;
    }
    setLocalError(null);
    const input = {
      label: (form.label as AddressLabel) ?? 'OTHER',
      recipientName: form.recipientName.trim(),
      phone: form.phone.trim() || null,
      houseFlat: form.houseFlat.trim(),
      streetArea: form.streetArea.trim(),
      landmark: form.landmark.trim() || null,
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      latitude,
      longitude,
      deliveryInstructions: form.deliveryInstructions.trim() || null,
      isDefault: form.isDefault,
    };
    await onSave(input, address?.id);
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-teal focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="address-form-title"
      onClick={onClose}
    >
      <form
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="address-form-title" className="text-lg font-bold text-brand-navy">
            {address ? 'Edit address' : 'Add address'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:text-brand-navy"
            aria-label="Close address form"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Label</span>
            <select
              value={form.label}
              onChange={(event) => setField('label', event.target.value)}
              className={inputClass}
            >
              <option value="HOME">HOME</option>
              <option value="WORK">WORK</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Recipient name *
            </span>
            <input
              value={form.recipientName}
              onChange={(event) => setField('recipientName', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Phone</span>
            <input
              value={form.phone}
              onChange={(event) => setField('phone', event.target.value)}
              className={inputClass}
              inputMode="tel"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">House / flat *</span>
            <input
              value={form.houseFlat}
              onChange={(event) => setField('houseFlat', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Street / area *</span>
            <input
              value={form.streetArea}
              onChange={(event) => setField('streetArea', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Landmark</span>
            <input
              value={form.landmark}
              onChange={(event) => setField('landmark', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">City *</span>
            <input
              value={form.city}
              onChange={(event) => setField('city', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">State *</span>
            <input
              value={form.state}
              onChange={(event) => setField('state', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              PIN / postal code *
            </span>
            <input
              value={form.postalCode}
              onChange={(event) => setField('postalCode', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Latitude</span>
            <input
              value={form.latitude}
              onChange={(event) => setField('latitude', event.target.value)}
              className={inputClass}
              placeholder="e.g. 16.3015"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Longitude</span>
            <input
              value={form.longitude}
              onChange={(event) => setField('longitude', event.target.value)}
              className={inputClass}
              placeholder="e.g. 80.4405"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-600">
              Delivery instructions
            </span>
            <textarea
              value={form.deliveryInstructions}
              onChange={(event) => setField('deliveryInstructions', event.target.value)}
              className={inputClass}
              rows={2}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => setField('isDefault', event.target.checked)}
              className="h-4 w-4 accent-brand-teal"
            />
            Use as my default delivery address
          </label>
        </div>

        {localError ? (
          <p className="mt-3 text-sm font-semibold text-brand-orange" role="alert">
            {localError}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-navy/90 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save address'}
          </button>
        </div>
      </form>
    </div>
  );
}
