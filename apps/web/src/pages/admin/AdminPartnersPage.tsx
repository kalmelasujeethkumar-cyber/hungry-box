import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  BranchDto,
  DeliveryPartnerListItemDto,
  DeliveryPartnerStatus,
  KycDocumentType,
} from '@hungrybox/shared';
import { branchKycApi, branchesApi, branchDeliveryApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import Pagination from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { UserIcon } from '../../features/storefront/components/icons';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { useLatestRequest } from '../../lib/use-latest-request';
import { PARTNER_PAGE_SIZE } from '../../features/manager/manager-partners';
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_TONES,
  KYC_DOCUMENT_LABELS,
  KYC_OVERALL_LABELS,
  KYC_OVERALL_TONES,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
} from '../../features/delivery/delivery-status';
import AdminLayout from './AdminLayout';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
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

export default function AdminPartnersPage(): JSX.Element {
  const { token } = useAuth();
  const [partners, setPartners] = useState<DeliveryPartnerListItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<DeliveryPartnerStatus | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);

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
        branchId: branchId || undefined,
        status: statusFilter,
        search: debouncedSearch.trim() || undefined,
        limit: PARTNER_PAGE_SIZE,
        offset,
      })
      .then((result) => {
        // A slower earlier request must not replace the rows the admin is now reading.
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
  }, [token, branchId, statusFilter, debouncedSearch, offset, latestRequest]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    branchesApi
      .list(token)
      .then(setBranches)
      .catch((err: unknown) => {
        /**
         * Reported rather than swallowed. A silently empty branch list leaves the filter
         * showing only "All branches", which reads as "this branch has no partners" when
         * the truth is that the filter itself failed to load.
         */
        setBranchError(
          err instanceof Error ? err.message : 'Could not load the branch filter.',
        );
      });
  }, [token]);

  /**
   * Changing a filter restarts at the first page, otherwise the manager would be looking
   * at page 3 of a result that only has one page and conclude partners are missing.
   */
  const applyBranch = (next: string): void => {
    setBranchId(next);
    setOffset(0);
  };

  const applyStatus = (next: DeliveryPartnerStatus | undefined): void => {
    setStatusFilter(next);
    setOffset(0);
  };

  const applySearch = (next: string): void => {
    setSearch(next);
    setOffset(0);
  };

  const handleViewDocument = (deliveryPartnerId: string, type: KycDocumentType): void => {
    if (!token) return;
    setKycError(null);
    branchKycApi
      .documentAccess(deliveryPartnerId, type, token)
      .then((access) => window.open(access.url, '_blank', 'noopener,noreferrer'))
      .catch((err: unknown) =>
        setKycError(err instanceof Error ? err.message : 'Could not open the document.'),
      );
  };

  return (
    <AdminLayout kicker="Global operations" title="Delivery partners">
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={search}
          onChange={(event) => applySearch(event.target.value)}
          placeholder="Search by name or partner ID"
          aria-label="Search partners"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-brand-teal focus:outline-none lg:w-72"
        />
        <select
          value={branchId}
          onChange={(event) => applyBranch(event.target.value)}
          aria-label="Filter by branch"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-teal focus:outline-none"
        >
          <option value="">All branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter ?? ''}
          onChange={(event) =>
            applyStatus((event.target.value as DeliveryPartnerStatus) || undefined)
          }
          aria-label="Filter by status"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-teal focus:outline-none"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {branchError ? (
        <Notice tone="warning" className="mt-4">
          {branchError} The table below is showing every branch.
        </Notice>
      ) : null}

      {error ? (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      ) : null}
      {kycError ? (
        <Notice tone="error" className="mt-4">
          {kycError}
        </Notice>
      ) : null}

      {loading ? (
        <LoadingState message="Loading partners" className="mt-8" />
      ) : partners.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<UserIcon className="h-8 w-8" />}
            title="No partners found"
            message="Delivery partners across all branches will appear here."
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {partners.map((partner) => {
            const kyc = partner.kyc;
            return (
              <li
                key={partner.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-brand-navy">{partner.fullName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {partner.partnerId} · {partner.branch.name} ({partner.branch.city})
                  </p>
                  {kyc ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Aadhaar {kyc.hasAadhaar ? 'uploaded' : 'missing'} · licence{' '}
                      {kyc.hasDrivingLicense ? 'uploaded' : 'missing'}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {kyc ? (
                    <>
                      <StatusBadge
                        label={KYC_OVERALL_LABELS[kyc.overallState]}
                        tone={KYC_OVERALL_TONES[kyc.overallState]}
                      />
                      {kyc.hasAadhaar ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleViewDocument(partner.partnerId, 'AADHAAR')}
                        >
                          {KYC_DOCUMENT_LABELS.AADHAAR}
                        </Button>
                      ) : null}
                      {kyc.hasDrivingLicense ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleViewDocument(partner.partnerId, 'DRIVING_LICENSE')}
                        >
                          {KYC_DOCUMENT_LABELS.DRIVING_LICENSE}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  <StatusBadge
                    label={AVAILABILITY_LABELS[partner.availability]}
                    tone={AVAILABILITY_TONES[partner.availability]}
                  />
                  <StatusBadge
                    label={PARTNER_STATUS_LABELS[partner.status]}
                    tone={PARTNER_STATUS_TONES[partner.status]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading ? (
        <Pagination
          page={Math.floor(offset / PARTNER_PAGE_SIZE) + 1}
          limit={PARTNER_PAGE_SIZE}
          total={total}
          shown={partners.length}
          onPageChange={(next) => setOffset((next - 1) * PARTNER_PAGE_SIZE)}
          filtered={statusFilter !== undefined || branchId !== '' || search.trim() !== ''}
        />
      ) : null}
    </AdminLayout>
  );
}
