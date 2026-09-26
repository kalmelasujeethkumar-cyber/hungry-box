import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { BranchProductDto } from '@hungrybox/shared';
import { ApiError, branchProductsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import ConfirmDialog from '../../features/storefront/components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import { formatPaise } from '../../lib/money';
import ManagerLayout from './ManagerLayout';

type EditState = { product: BranchProductDto } | null;

export default function ManagerCatalogPage(): JSX.Element {
  const { token, user } = useAuth();
  const branchId = user?.branchId ?? null;
  const [products, setProducts] = useState<BranchProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState>(null);
  const [deactivate, setDeactivate] = useState<BranchProductDto | null>(null);
  const [form, setForm] = useState({ priceMinor: 0, discountMinor: 0, isAvailable: true });

  const refresh = useCallback(() => {
    if (!token || !branchId) return;
    setLoading(true);
    setError(null);
    branchProductsApi
      .list(branchId, token)
      .then(setProducts)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load the catalogue.');
      })
      .finally(() => setLoading(false));
  }, [token, branchId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openEdit = (product: BranchProductDto): void => {
    setForm({
      priceMinor: product.priceMinor,
      discountMinor: product.discountMinor,
      isAvailable: product.isAvailable,
    });
    setError(null);
    setFormError(null);
    setEdit({ product });
  };

  const priceMinor = form.priceMinor;
  const discountMinor = form.discountMinor;
  const priceInvalid = Number.isNaN(priceMinor) || priceMinor < 0;
  const discountInvalid =
    Number.isNaN(discountMinor) || discountMinor < 0 || discountMinor > priceMinor;

  const submitEdit = (): void => {
    if (!token || !edit) return;
    if (discountInvalid) {
      setFormError(
        discountMinor > priceMinor
          ? 'Discount cannot exceed price.'
          : 'Enter a valid discount amount.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setFormError(null);
    const { product } = edit;
    branchProductsApi
      .update(
        product.id,
        {
          priceMinor,
          discountMinor,
          isAvailable: form.isAvailable,
          status: product.status,
        },
        token,
      )
      .then(() => {
        setEdit(null);
        refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not save the product.');
      })
      .finally(() => setBusy(false));
  };

  const submitDeactivate = (): void => {
    if (!token || !deactivate) return;
    setBusy(true);
    setError(null);
    branchProductsApi
      .deactivate(deactivate.id, token)
      .then(() => {
        setDeactivate(null);
        refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not deactivate the product.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <ManagerLayout kicker="Branch operations" title="Catalogue">
      {error ? (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      ) : null}

      {loading && products.length === 0 ? (
        <LoadingState message="Loading catalogue…" className="mt-8" />
      ) : products.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<PackageIcon className="h-8 w-8" />}
            title="No branch products"
            message="Configure products for your branch to start receiving orders."
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-brand-navy">{product.product.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {product.product.categoryName ?? 'Uncategorised'}
                  </p>
                </div>
                <StatusBadge
                  label={product.status === 'ACTIVE' && product.isAvailable ? 'Live' : 'Inactive'}
                  tone={product.status === 'ACTIVE' && product.isAvailable ? 'success' : 'neutral'}
                />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold text-brand-navy">
                    {formatPaise(product.effectivePriceMinor)}
                  </p>
                  {product.discountMinor > 0 ? (
                    <p className="mt-0.5 text-xs text-slate-500 line-through">
                      {formatPaise(product.priceMinor)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="accent" size="sm" onClick={() => openEdit(product)}>
                    Edit
                  </Button>
                  {product.status === 'ACTIVE' ? (
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      onClick={() => setDeactivate(product)}
                      disabled={busy}
                    >
                      Hide
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {edit ? (
        <Dialog
          open={edit !== null}
          title={`Edit ${edit.product.product.name}`}
          onClose={() => setEdit(null)}
          closeOnBackdrop={false}
          className="max-w-sm"
        >
          {formError ? (
            <Notice tone="error" className="mt-4">
              {formError}
            </Notice>
          ) : null}
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              Price (₹)
              <input
                type="number"
                min={0}
                value={priceMinor / 100}
                onChange={(event) => {
                  setForm({ ...form, priceMinor: Math.round(Number(event.target.value) * 100) });
                  setFormError(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Discount (₹)
              <input
                type="number"
                min={0}
                value={discountMinor / 100}
                onChange={(event) => {
                  setForm({
                    ...form,
                    discountMinor: Math.round(Number(event.target.value) * 100),
                  });
                  setFormError(null);
                }}
                aria-invalid={discountInvalid}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {discountInvalid ? (
              <Notice tone="error">
                {discountMinor > priceMinor
                  ? 'Discount cannot exceed price.'
                  : 'Enter a valid discount amount.'}
              </Notice>
            ) : null}
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(event) => setForm({ ...form, isAvailable: event.target.checked })}
                className="h-4 w-4"
              />
              Available for ordering
            </label>
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setEdit(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={submitEdit}
              loading={busy}
              loadingLabel="Saving…"
              disabled={priceInvalid || discountInvalid}
            >
              Save changes
            </Button>
          </div>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={deactivate !== null}
        title="Hide this product?"
        description={`${deactivate?.product.name ?? 'This product'} will be hidden from customers in your branch.`}
        confirmLabel="Hide product"
        danger
        busy={busy && deactivate !== null}
        busyLabel="Hiding…"
        onConfirm={submitDeactivate}
        onClose={() => setDeactivate(null)}
      />
    </ManagerLayout>
  );
}
