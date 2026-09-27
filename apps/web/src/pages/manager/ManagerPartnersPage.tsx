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
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { useLatestRequest } from '../../lib/use-latest-request';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import Pagination from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { PlusIcon, UserIcon } from '../../features/storefront/components/icons';
import { PARTNER_PAGE_SIZE } from '../../features/manager/manager-partners';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_TONES,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
} from '../../features/delivery/delivery-status';
import ManagerLayout from './ManagerLayout';
import { BRANCH_PARTNERS_PATH } from '../../routes/paths';

function PartnerRow({ partner }: { partner: DeliveryPartnerListItemDto }): JSX.Element {
  return (
    <Link
      to={`${BRANCH_PARTNERS_PATH}/${partner.id}`}
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
        <StatusBadge
          label={AVAILABILITY_LABELS[partner.availability]}
          tone={AVAILABILITY_TONES[partner.availability]}
        />
        <StatusBadge
          label={PARTNER_STATUS_LABELS[partner.status]}
          tone={PARTNER_STATUS_TONES[partner.status]}
        />
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

/** Settle time before a typed search becomes a query. */
const SEARCH_DEBOUNCE_MS = 300;

export default function ManagerPartnersPage(): JSX.Element {
  const { token } = useAuth();
  const [partners, setPartners] = useState<DeliveryPartnerListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<DeliveryPartnerStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  /**
   * Typing is debounced so a burst of keystrokes becomes one query, and responses are
   * order-guarded so a slow earlier request cannot replace the newer filtered results.
   */
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const latestRequest = useLatestRequest();

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const request = latestRequest.begin();
    branchDeliveryApi
      .listPartners(token, {
        status: statusFilter,
        search: debouncedSearch.trim() || undefined,
        limit: PARTNER_PAGE_SIZE,
        offset,
      })
      .then((result) => {
        // A slower earlier request must not overwrite the rows the manager is now reading.
        if (!latestRequest.isCurrent(request)) return;
        setPartners(result.items);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        if (!latestRequest.isCurrent(request)) return;
        setError(err instanceof Error ? err.message : 'Could not load partners.');
      })
      .finally(() => {
        if (latestRequest.isCurrent(request)) setLoading(false);
      });
  }, [token, statusFilter, debouncedSearch, offset, latestRequest]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** A new filter restarts at page one so the manager is not stranded past the end. */
  const applyStatus = (next: DeliveryPartnerStatus | undefined): void => {
    setStatusFilter(next);
    setOffset(0);
  };

  const applySearch = (next: string): void => {
    setSearch(next);
    setOffset(0);
  };

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
        setForm({
          fullName: '',
          loginId: '',
          email: '',
          mobile: '',
          vehicleType: '',
          vehicleNumber: '',
        });
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
            onChange={(event) => applySearch(event.target.value)}
            placeholder="Search by name or partner ID"
            aria-label="Search partners"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-brand-teal focus:outline-none sm:w-72"
          />
          <select
            value={statusFilter ?? ''}
            onChange={(event) =>
            applyStatus((event.target.value as DeliveryPartnerStatus) || undefined)
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
        <Button
          variant="accent"
          onClick={() => {
            setTempPassword(null);
            setCreateOpen(true);
          }}
        >
          <PlusIcon className="h-4 w-4" />
          Add partner
        </Button>
      </div>

      {error ? (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      ) : null}

      {tempPassword ? (
        <Notice tone="success" className="mt-4" title="Partner created">
          <p>
            One-time login password: <span className="font-mono font-bold">{tempPassword}</span>
          </p>
          <p className="mt-1 text-xs">Share it once. It is not stored and cannot be recovered.</p>
        </Notice>
      ) : null}

      {loading && partners.length === 0 ? (
        <LoadingState message="Loading partners…" className="mt-10" />
      ) : (
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
      )}

      {!loading ? (
        <Pagination
          page={Math.floor(offset / PARTNER_PAGE_SIZE) + 1}
          limit={PARTNER_PAGE_SIZE}
          total={total}
          shown={partners.length}
          onPageChange={(next) => setOffset((next - 1) * PARTNER_PAGE_SIZE)}
          filtered={statusFilter !== undefined || search.trim() !== ''}
        />
      ) : null}

      <ConfirmDialog
        open={createOpen}
        title="Add delivery partner"
        description="The partner receives a partner ID and a one-time password. Documents are collected during verification."
        confirmLabel="Create partner"
        cancelLabel="Cancel"
        busy={creating}
        busyLabel="Creating…"
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
