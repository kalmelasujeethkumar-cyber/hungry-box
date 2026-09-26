import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  BranchDto,
  BranchStatus,
  SetBranchStatusInput,
  UpdateBranchInput,
} from '@hungrybox/shared';
import { ApiError, branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { TextField } from '../../components/forms/TextField';
import { branchStatusLabel, branchStatusTone } from '../../components/status';
import { LocationIcon } from '../../features/storefront/components/icons';
import AdminLayout from './AdminLayout';

const STATUS_ACTIONS: Record<
  BranchStatus,
  { label: string; next: BranchStatus; danger?: boolean }[]
> = {
  ACTIVE: [
    { label: 'Pause', next: 'PAUSED' },
    { label: 'Deactivate', next: 'INACTIVE', danger: true },
  ],
  PAUSED: [
    { label: 'Activate', next: 'ACTIVE' },
    { label: 'Deactivate', next: 'INACTIVE', danger: true },
  ],
  INACTIVE: [{ label: 'Activate', next: 'ACTIVE' }],
};

function statusChangeDescription(branch: BranchDto, status: BranchStatus): string {
  if (status === 'INACTIVE') {
    return `${branch.name} will be deactivated and stop accepting or fulfilling orders.`;
  }
  if (status === 'PAUSED') {
    return `${branch.name} will be paused. Customers can no longer order, but the branch can be resumed later.`;
  }
  return `${branch.name} will be activated for customers.`;
}

export default function AdminBranchesPage(): JSX.Element {
  const { token } = useAuth();
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{
    branch: BranchDto;
    status: BranchStatus;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRadius, setEditRadius] = useState(0);
  const [editAddress, setEditAddress] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    branchesApi
      .list(token)
      .then(setBranches)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load branches.'),
      )
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestStatus = (branch: BranchDto, status: BranchStatus): void => {
    setSuccessMessage(null);
    setPendingStatus({ branch, status });
  };

  const applyStatus = (): void => {
    const pending = pendingStatus;
    if (!pending || !token) return;
    setPendingStatus(null);
    const input: SetBranchStatusInput = { status: pending.status };
    branchesApi
      .setStatus(pending.branch.id, input, token)
      .then((updated) => {
        setBranches((current) => current.map((b) => (b.id === updated.id ? updated : b)));
        setSuccessMessage(
          `${pending.branch.name} marked as ${branchStatusLabel[pending.status].toLowerCase()}.`,
        );
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not update the branch status.'),
      );
  };

  const openEdit = (branch: BranchDto): void => {
    setSuccessMessage(null);
    if (editingId === branch.id) {
      setEditingId(null);
      return;
    }
    setEditingId(branch.id);
    setEditRadius(branch.deliveryRadiusKm);
    setEditAddress(branch.address ?? '');
    setEditError(null);
    setEditNotice(null);
  };

  const saveEdit = (): void => {
    if (!token || !editingId) return;
    setEditBusy(true);
    setEditError(null);
    setEditNotice(null);
    const input: UpdateBranchInput = {
      deliveryRadiusKm: editRadius,
      address: editAddress.trim() || null,
    };
    branchesApi
      .update(editingId, input, token)
      .then((updated) => {
        setBranches((current) => current.map((b) => (b.id === updated.id ? updated : b)));
        setEditRadius(updated.deliveryRadiusKm);
        setEditAddress(updated.address ?? '');
        setEditNotice('Branch settings saved.');
      })
      .catch((err: unknown) =>
        setEditError(err instanceof ApiError ? err.message : 'Could not update the branch.'),
      )
      .finally(() => setEditBusy(false));
  };

  return (
    <AdminLayout kicker="Branch locations" title="Branches">
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {loading ? (
        <LoadingState message="Loading branches" />
      ) : branches.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<LocationIcon className="h-8 w-8" />}
            title="No branches"
            message="Branches will appear here once one is created."
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {branches.map((branch) => (
            <article key={branch.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold text-brand-navy">{branch.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {branch.code} · {branch.city}, {branch.state}, {branch.country}
                  </p>
                  {branch.address ? (
                    <p className="mt-1 text-sm text-slate-600">{branch.address}</p>
                  ) : null}
                </div>
                <StatusBadge
                  label={branchStatusLabel[branch.status]}
                  tone={branchStatusTone[branch.status]}
                />
              </div>

              <div className="mt-3">
                <span className="rounded-full bg-brand-sky/60 px-2.5 py-1 text-xs font-bold text-brand-navy">
                  {branch.deliveryRadiusKm} km delivery radius
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {STATUS_ACTIONS[branch.status].map((action) => (
                  <Button
                    key={action.label}
                    size="sm"
                    variant={action.danger ? 'dangerOutline' : 'secondary'}
                    onClick={() => requestStatus(branch, action.next)}
                  >
                    {action.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={editingId === branch.id ? 'accentOutline' : 'secondary'}
                  onClick={() => openEdit(branch)}
                >
                  {editingId === branch.id ? 'Close' : 'Edit'}
                </Button>
              </div>

              {editingId === branch.id ? (
                <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
                  <TextField
                    label="Delivery radius (km)"
                    type="number"
                    min={1}
                    step={0.5}
                    value={editRadius}
                    onChange={(event) => setEditRadius(Number(event.target.value))}
                  />
                  <TextField
                    label="Address"
                    type="text"
                    value={editAddress}
                    onChange={(event) => setEditAddress(event.target.value)}
                    placeholder="Street, area, city"
                  />
                  {editError ? <Notice tone="error">{editError}</Notice> : null}
                  {editNotice ? <Notice tone="success">{editNotice}</Notice> : null}
                  <Button
                    onClick={saveEdit}
                    disabled={editBusy || editRadius < 1}
                    loading={editBusy}
                    loadingLabel="Saving…"
                  >
                    Save changes
                  </Button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingStatus !== null}
        title={
          pendingStatus
            ? `${branchStatusLabel[pendingStatus.status]} ${pendingStatus.branch.name}?`
            : 'Update branch'
        }
        description={
          pendingStatus ? statusChangeDescription(pendingStatus.branch, pendingStatus.status) : ''
        }
        confirmLabel={pendingStatus ? branchStatusLabel[pendingStatus.status] : 'Confirm'}
        cancelLabel="Cancel"
        danger={pendingStatus?.status === 'INACTIVE'}
        onConfirm={applyStatus}
        onClose={() => setPendingStatus(null)}
      />
    </AdminLayout>
  );
}
