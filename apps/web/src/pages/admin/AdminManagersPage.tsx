import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type {
  BranchDto,
  CreateManagerInput,
  CreateManagerResultDto,
  ManagerStatus,
  UserListItemDto,
  UserListQuery,
  UserListResultDto,
  UserStatus,
} from '@hungrybox/shared';
import { ApiError, branchesApi, usersApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../features/storefront/components/EmptyState';
import { PlusIcon, UserIcon } from '../../features/storefront/components/icons';
import { formatDateOnly } from '../../lib/format';
import AdminLayout from './AdminLayout';

const PAGE_SIZE = 25;

const MANAGER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
] as const;

const MANAGER_BADGE: Record<UserStatus, string> = {
  ACTIVE: 'rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700',
  INACTIVE: 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600',
  SUSPENDED: 'rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700',
  PENDING: 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700',
};

interface UserAction {
  label: string;
  next: ManagerStatus;
  danger?: boolean;
}

interface PendingManagerAction extends UserAction {
  user: UserListItemDto;
}

function managerStatusLabel(status: UserStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function userActions(user: UserListItemDto): UserAction[] {
  if (user.status === 'ACTIVE') {
    return [
      { label: 'Make inactive', next: 'INACTIVE' },
      { label: 'Suspend', next: 'SUSPENDED', danger: true },
    ];
  }
  return [{ label: 'Activate', next: 'ACTIVE' }];
}

function actionButtonClass(danger: boolean | undefined, next: ManagerStatus): string {
  if (danger) {
    return 'rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50';
  }
  if (next === 'ACTIVE') {
    return 'rounded-lg border border-brand-teal px-3 py-1.5 text-xs font-semibold text-brand-teal hover:bg-brand-sky/40';
  }
  return 'rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-teal hover:text-brand-teal';
}

function statusActionDescription(user: UserListItemDto, next: ManagerStatus): string {
  const name = user.name ?? user.loginId;
  if (next === 'SUSPENDED') {
    return `${name} will be suspended and lose access until reactivated.`;
  }
  if (next === 'INACTIVE') {
    return `${name} will be deactivated and can no longer sign in.`;
  }
  return `${name} will be reactivated for branch management.`;
}

export default function AdminManagersPage(): JSX.Element {
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ManagerStatus>('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UserListResultDto | null>(null);
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [managerBranchId, setManagerBranchId] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateManagerResultDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingManagerAction | null>(null);

  const buildQuery = useCallback(
    (): UserListQuery => ({
      role: 'BRANCH_MANAGER',
      search: search.trim() || undefined,
      branchId: branchId || undefined,
      status: statusFilter || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [search, branchId, statusFilter, page],
  );

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    usersApi
      .list(buildQuery(), token)
      .then(setResult)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load managers.'),
      )
      .finally(() => setLoading(false));
  }, [token, buildQuery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    branchesApi
      .list(token)
      .then(setBranches)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not load branches.'),
      );
  }, [token]);

  const openCreate = (): void => {
    setCreated(null);
    setCreateError(null);
    setName('');
    setLoginId('');
    setManagerBranchId('');
    setCopied(false);
    setCreateOpen(true);
  };

  const closeCreate = (): void => {
    if (saving) return;
    setCreateOpen(false);
    setCreateError(null);
    setName('');
    setLoginId('');
    setManagerBranchId('');
  };

  const submitCreate = (): void => {
    if (!token) return;
    setSaving(true);
    setCreateError(null);
    const input: CreateManagerInput = {
      name: name.trim(),
      loginId: loginId.trim(),
      branchId: managerBranchId,
    };
    usersApi
      .createManager(input, token)
      .then((managerCreated) => {
        setCreated(managerCreated);
        setCopied(false);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.details?.code === 'auth.login_id_taken') {
          setCreateError('That login ID is already in use.');
        } else {
          setCreateError(err instanceof Error ? err.message : 'Could not create the manager.');
        }
      })
      .finally(() => setSaving(false));
  };

  const copyPassword = (): void => {
    if (!created) return;
    void navigator.clipboard.writeText(created.temporaryPassword).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const closeCreated = (): void => {
    setCreated(null);
    setCreateOpen(false);
    setCopied(false);
    setName('');
    setLoginId('');
    setManagerBranchId('');
    refresh();
  };

  const requestAction = (user: UserListItemDto, action: UserAction): void => {
    setPendingAction({ user, ...action });
  };

  const applyStatus = (): void => {
    const pending = pendingAction;
    if (!pending) return;
    if (!token) {
      setPendingAction(null);
      return;
    }
    setPendingAction(null);
    usersApi
      .setStatus(pending.user.id, { status: pending.next }, token)
      .then(() => refresh())
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Could not update the manager status.'),
      );
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;

  return (
    <AdminLayout kicker="Administration" title="Branch managers">
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold text-slate-700">
          Search
          <input
            type="text"
            value={search}
            placeholder="Name or login id"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="ml-2 w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Branch
          <select
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as '' | ManagerStatus);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-medium"
          >
            {MANAGER_STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90"
        >
          <PlusIcon className="h-4 w-4" />
          Add manager
        </button>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading managers…</p>
      ) : !result || result.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<UserIcon className="h-8 w-8" />}
            title="No branch managers"
            message="Create a branch manager to run a branch."
            action={
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-teal/90"
              >
                <PlusIcon className="h-4 w-4" />
                Add manager
              </button>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {result.items.map((manager) => (
            <li key={manager.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-brand-navy">
                    {manager.name ?? manager.loginId}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{manager.loginId}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {manager.branchName ? (
                    <span className="rounded-full bg-brand-sky/60 px-2.5 py-0.5 text-xs font-bold text-brand-navy">
                      {manager.branchName}
                    </span>
                  ) : null}
                  <span className={MANAGER_BADGE[manager.status]}>
                    {managerStatusLabel(manager.status)}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  Created {formatDateOnly(manager.createdAt)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {userActions(manager).map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => requestAction(manager, action)}
                      className={actionButtonClass(action.danger, action.next)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-slate-500">
          Page {page} of {totalPages} · {result?.total ?? 0} managers
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-teal disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction ? `${managerStatusLabel(pendingAction.next)} manager?` : 'Update manager'
        }
        description={
          pendingAction ? statusActionDescription(pendingAction.user, pendingAction.next) : ''
        }
        confirmLabel={pendingAction?.label ?? 'Confirm'}
        cancelLabel="Cancel"
        danger={pendingAction?.danger}
        onConfirm={applyStatus}
        onClose={() => setPendingAction(null)}
      />

      {createOpen && !created ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-manager-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="create-manager-title" className="text-lg font-bold text-brand-navy">
              Add branch manager
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The manager gets a one-time password shown immediately after creation.
            </p>
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-semibold text-slate-700">
                Full name
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full name"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Login id
                <input
                  type="text"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  placeholder="Login id"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Branch
                <select
                  value={managerBranchId}
                  onChange={(event) => setManagerBranchId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-teal focus:outline-none"
                >
                  <option value="" disabled>
                    Select a branch
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {createError ? (
              <p className="mt-3 text-sm font-semibold text-red-600">{createError}</p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeCreate}
                disabled={saving}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-teal hover:text-brand-teal disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={
                  saving || name.trim() === '' || loginId.trim() === '' || managerBranchId === ''
                }
                className="flex-1 rounded-lg bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-teal/90 disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create manager'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen && created ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manager-created-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="manager-created-title" className="text-lg font-bold text-brand-navy">
              Manager created
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {created.manager.name ?? created.manager.loginId} ·{' '}
              {created.manager.branchName ?? 'Unassigned'}
            </p>
            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">
              One-time password
            </p>
            <p className="mt-2 select-all rounded-lg bg-brand-sky/40 p-3 font-mono text-lg font-bold text-brand-navy">
              {created.temporaryPassword}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-teal px-4 py-2 text-sm font-semibold text-brand-teal hover:bg-brand-sky/40"
              >
                Copy password
              </button>
              {copied ? (
                <span className="text-sm font-semibold text-emerald-600">Copied</span>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-600">Copy it now — it is shown only once.</p>
            <button
              type="button"
              onClick={closeCreated}
              className="mt-5 w-full rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
