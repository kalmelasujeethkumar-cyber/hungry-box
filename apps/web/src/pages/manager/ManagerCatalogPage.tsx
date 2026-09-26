import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { BranchProductDto } from '@hungrybox/shared';
import { ApiError, branchProductsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
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
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState>(null);
  const [deactivate, setDeactivate] = useState<BranchProductDto | null>(null);
  const [form, setForm] = useState({ priceMinor: 0, discountMinor: 0, isAvailable: true });

  const refresh = useCallback(() => {
    if (!token || !branchId) return;
    branchProductsApi
      .list(branchId, token)
      .then(setProducts)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load the catalogue.');
      });
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
    setEdit({ product });
  };

  const submitEdit = (): void => {
    if (!token || !edit) return;
    setBusy(true);
    setError(null);
    const { product } = edit;
    branchProductsApi
      .update(
        product.id,
        {
          priceMinor: form.priceMinor,
          discountMinor: form.discountMinor,
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
      {error ? <p className="mt-6 text-sm font-semibold text-red-600">{error}</p> : null}

      {products.length === 0 ? (
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
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    product.status === 'ACTIVE' && product.isAvailable
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {product.status === 'ACTIVE' && product.isAvailable ? 'Live' : 'Inactive'}
                </span>
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
                  <button
                    type="button"
                    onClick={() => openEdit(product)}
                    className="rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90"
                  >
                    Edit
                  </button>
                  {product.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => setDeactivate(product)}
                      disabled={busy}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Hide
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-product-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="edit-product-title" className="text-lg font-bold text-brand-navy">
              Edit {edit.product.product.name}
            </h2>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              Price (₹)
              <input
                type="number"
                min={0}
                value={form.priceMinor / 100}
                onChange={(event) =>
                  setForm({ ...form, priceMinor: Math.round(Number(event.target.value) * 100) })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Discount (₹)
              <input
                type="number"
                min={0}
                value={form.discountMinor / 100}
                onChange={(event) =>
                  setForm({ ...form, discountMinor: Math.round(Number(event.target.value) * 100) })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.isAvailable}
                onChange={(event) => setForm({ ...form, isAvailable: event.target.checked })}
                className="h-4 w-4"
              />
              Available for ordering
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-teal"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={busy}
                className="flex-1 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90 disabled:opacity-50"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deactivate !== null}
        title="Hide this product?"
        description={`${deactivate?.product.name ?? 'This product'} will be hidden from customers in your branch.`}
        confirmLabel="Hide product"
        danger
        onConfirm={submitDeactivate}
        onClose={() => setDeactivate(null)}
      />
    </ManagerLayout>
  );
}
