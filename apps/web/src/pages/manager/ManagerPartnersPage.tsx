import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  CreateDeliveryPartnerInput,
  DeliveryPartnerListItemDto,
  DeliveryPartnerStatus,
} from '@hungrybox/shared';
import { ApiError, branchDeliveryApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { PlusIcon, UserIcon } from '../../features/storefront/components/icons';
import { AVAILABILITY_LABELS, PARTNER_STATUS_LABELS } from '../../features/delivery/delivery-status';
import ManagerLayout from './ManagerLayout';

function PartnerRow({ partner }: { partner: DeliveryPartnerListItemDto }): JSX.Element {
  return (
    <Link
      to={`/manager/partners/${partner.id}`}
      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand-teal"
    >
      <div className="min-w-0">
        <p className="truncate font-bold text-brand-navy">{partner.fullName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {partner.partnerId} · {partner.branch.name}
          {partner.distanceKm !== null ? ` · ${partner.distanceKm} km` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-brand-sky/60 px-2.5 py-1 text-xs font-bold text-brand-navy">
          {AVAILABILITY_LABELS[partner.availability]}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {PARTNER_STATUS_LABELS[partner.status]}
        </span>
      </div>
    </Link>
  );
}

const STATUS_OPTIONS = [
  { value: undefined, label: 'All statuses' },
  { value: 'PENDING_VERIFICATION', label: 'Pending' },
  { value: 'DOCUMENT_REVIEW', label: 'In review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

export default function ManagerPartnersPage(): JSX.Element {
  const { token } = useAuth();
  const [partners, setPartners] = useState<DeliveryPartnerListItemDto[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryPartnerStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    loginId: '',
    email: '',
    mobile: '',
    vehicleType: '',
    vehicleNumber: '',
  });

  const refresh = useCallback(() => {
    if (!token) return;
    branchDeliveryApi
      .listPartners(token, { status: statusFilter, search: search.trim() || undefined })
      .then(setPartners)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load partners.');
      });
  }, [token, statusFilter, search]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const submitCreate = (): void => {
    if (!token) return;
    setCreating(true);
    setError(null);
    const input: CreateDeliveryPartnerInput = {
      fullName: form.fullName.trim(),
      loginId: form.loginId.trim(),
      email: form.email.trim() || undefined,
      mobile: form.mobile.trim() || undefined,
      vehicleType: form.vehicleType.trim() || undefined,
      vehicleNumber: form.vehicleNumber.trim() || undefined,
    };
    branchDeliveryApi
      .createPartner(input, token)
      .then((result) => {
        setTempPassword(result.temporaryPassword);
        setCreateOpen(false);
        setForm({ fullName: '', loginId: '', email: '', mobile: '', vehicleType: '', vehicleNumber: '' });
        refresh();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.details?.code === 'auth.login_id_taken') {
          setError('That login ID is already in use.');
        } else {
          setError(err instanceof Error ? err.message : 'Could not create the partner.');
        }
        setCreating(false);
      })
      .finally(() => setCreating(false));
  };

  return (
    <ManagerLayout kicker="Branch operations" title="Delivery partners">
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or partner ID"
            aria-label="Search partners"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-brand-teal focus:outline-none sm:w-72"
          />
          <select
            value={statusFilter ?? ''}
            onChange={(event) =>
              setStatusFilter((event.target.value as DeliveryPartnerStatus) || undefined)
            }
            aria-label="Filter by status"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-teal focus:outline-none"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ''}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setTempPassword(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-teal/90"
        >
          <PlusIcon className="h-4 w-4" />
          Add partner
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {tempPassword ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-bold">Partner created</p>
          <p className="mt-1">
            One-time login password: <span className="font-mono font-bold">{tempPassword}</span>
          </p>
          <p className="mt-1 text-xs">
            Share it once. It is not stored and cannot be recovered.
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {partners.length === 0 ? (
          <EmptyState
            icon={<UserIcon className="h-8 w-8" />}
            title="No partners found"
            message="Add a delivery partner to get started with deliveries in your branch."
          />
        ) : (
          partners.map((partner) => <PartnerRow key={partner.id} partner={partner} />)
        )}
      </div>

      <ConfirmDialog
        open={createOpen}
        title="Add delivery partner"
        description="The partner receives a partner ID and a one-time password. Documents are collected during verification."
        confirmLabel={creating ? 'Creating…' : 'Create partner'}
        cancelLabel="Cancel"
        onConfirm={submitCreate}
        onClose={() => !creating && setCreateOpen(false)}
      >
        <div className="mt-3 space-y-3">
          <input
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            placeholder="Full name"
            aria-label="Full name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
          />
          <input
            value={form.loginId}
            onChange={(event) => setForm({ ...form, loginId: event.target.value })}
            placeholder="Login ID (email or phone)"
            aria-label="Login ID (email or phone)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
          />
          <input
            value={form.mobile}
            onChange={(event) => setForm({ ...form, mobile: event.target.value })}
            placeholder="Mobile number"
            aria-label="Mobile number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
          />
          <input
            value={form.vehicleType}
            onChange={(event) => setForm({ ...form, vehicleType: event.target.value })}
            placeholder="Vehicle type (e.g. two-wheeler)"
            aria-label="Vehicle type"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
          />
          <input
            value={form.vehicleNumber}
            onChange={(event) => setForm({ ...form, vehicleNumber: event.target.value })}
            placeholder="Vehicle number"
            aria-label="Vehicle number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
          />
        </div>
      </ConfirmDialog>
    </ManagerLayout>
  );
}