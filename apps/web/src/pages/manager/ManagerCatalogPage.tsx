import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { BranchProductDto, BranchProductImageDto, ProductImageDto } from '@hungrybox/shared';
import { ApiError, branchProductMediaApi, branchProductsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { ImageField, imageFileError } from '../../components/ImageField';
import { LoadingState } from '../../components/LoadingState';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { PackageIcon } from '../../features/storefront/components/icons';
import { formatPaise } from '../../lib/money';
import ManagerLayout from './ManagerLayout';

type EditState = { product: BranchProductDto } | null;

const MAX_BRANCH_IMAGES = 3;

function sortImages<T extends { sortOrder: number }>(images: T[]): T[] {
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder);
}

export default function ManagerCatalogPage(): JSX.Element {
  const { token, user } = useAuth();
  const branchId = user?.branchId ?? null;
  const [products, setProducts] = useState<BranchProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState>(null);
  const [deactivate, setDeactivate] = useState<BranchProductDto | null>(null);
  const [form, setForm] = useState({ priceMinor: 0, discountMinor: 0, isAvailable: true });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [removeBranchImage, setRemoveBranchImage] = useState<BranchProductImageDto | null>(null);

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
    setImageFile(null);
    setImageAlt('');
    setError(null);
    setFormError(null);
    setImageError(null);
    setEdit({ product });
  };

  const closeEdit = (): void => {
    setEdit(null);
    setImageFile(null);
    setImageAlt('');
    setImageError(null);
  };

  /** Media results are authoritative, so a mutation refreshes the canonical image. */
  const applyMediaResult = (updated: BranchProductDto): void => {
    setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEdit((current) => (current ? { product: updated } : current));
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
      .then(applyMediaResult)
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

  const submitUploadBranchImage = (): void => {
    if (!token || !edit) return;
    if (!imageFile) {
      setImageError('Choose a branch image to upload.');
      return;
    }
    const validationError = imageFileError(imageFile);
    if (validationError) {
      setImageError(validationError);
      return;
    }
    setBusy(true);
    setImageError(null);
    branchProductMediaApi
      .uploadImage(edit.product.id, imageFile, imageAlt.trim() || undefined, token)
      .then((updated) => {
        setImageFile(null);
        setImageAlt('');
        applyMediaResult(updated);
      })
      .catch((err: unknown) => {
        setImageError(err instanceof Error ? err.message : 'Could not upload the branch image.');
      })
      .finally(() => setBusy(false));
  };

  const submitSetPrimaryBranchImage = (image: BranchProductImageDto): void => {
    if (!token) return;
    setBusy(true);
    setImageError(null);
    branchProductMediaApi
      .setPrimaryImage(image.id, token)
      .then(applyMediaResult)
      .catch((err: unknown) => {
        setImageError(err instanceof Error ? err.message : 'Could not update the branch image.');
      })
      .finally(() => setBusy(false));
  };

  const submitReorderBranchImage = (
    images: BranchProductImageDto[],
    image: BranchProductImageDto,
    direction: -1 | 1,
  ): void => {
    if (!token) return;
    const ordered = sortImages(images);
    const index = ordered.findIndex((entry) => entry.id === image.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const reordered = [...ordered];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy(true);
    setImageError(null);
    branchProductMediaApi
      .reorderImages({ orderedImageIds: reordered.map((entry) => entry.id) }, token)
      .then(applyMediaResult)
      .catch((err: unknown) => {
        setImageError(err instanceof Error ? err.message : 'Could not reorder the branch images.');
      })
      .finally(() => setBusy(false));
  };

  const submitRemoveBranchImage = (): void => {
    if (!token || !removeBranchImage) return;
    setBusy(true);
    setImageError(null);
    branchProductMediaApi
      .removeImage(removeBranchImage.id, token)
      .then((updated) => {
        setRemoveBranchImage(null);
        applyMediaResult(updated);
      })
      .catch((err: unknown) => {
        setImageError(err instanceof Error ? err.message : 'Could not remove the branch image.');
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
                <div className="flex min-w-0 items-start gap-3">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.product.name}
                      className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-sky/40 text-xs font-bold text-brand-navy"
                    >
                      HB
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-brand-navy">{product.product.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {product.product.categoryName ?? 'Uncategorised'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {product.branchImages.length > 0
                        ? `${product.branchImages.length} branch image${
                            product.branchImages.length === 1 ? '' : 's'
                          }`
                        : 'Using the Hungry Box image'}
                    </p>
                  </div>
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
          onClose={closeEdit}
          closeOnBackdrop={false}
          className="max-w-lg"
        >
          {formError ? (
            <Notice tone="error" className="mt-4">
              {formError}
            </Notice>
          ) : null}
          {imageError ? (
            <Notice tone="error" className="mt-4">
              {imageError}
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

          <section
            aria-labelledby="branch-images-heading"
            className="mt-6 border-t border-slate-200 pt-4"
          >
            <h3 id="branch-images-heading" className="text-sm font-bold text-brand-navy">
              Branch images
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Customers at your branch see the primary branch image first. Your images never change
              the Hungry Box catalogue for anyone else.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-600">
              {edit.product.branchImages.length} of {MAX_BRANCH_IMAGES} branch images — JPEG, PNG or
              WebP, up to 5 MB
            </p>
            {edit.product.branchImages.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No branch images yet, so the Hungry Box image is used.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {sortImages(edit.product.branchImages).map((image, index) => (
                  <li
                    key={image.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-2"
                  >
                    <img
                      src={image.imageUrl}
                      alt={image.altText ?? ''}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-600">{image.altText ?? '—'}</p>
                      {image.isPrimary ? (
                        <StatusBadge label="Shown to customers" tone="success" />
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          submitReorderBranchImage(edit.product.branchImages, image, -1)
                        }
                        disabled={busy || index === 0}
                      >
                        Move image up
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          submitReorderBranchImage(edit.product.branchImages, image, 1)
                        }
                        disabled={
                          busy || index === sortImages(edit.product.branchImages).length - 1
                        }
                      >
                        Move image down
                      </Button>
                      {!image.isPrimary ? (
                        <Button
                          variant="accentOutline"
                          size="sm"
                          onClick={() => submitSetPrimaryBranchImage(image)}
                          disabled={busy}
                        >
                          Set as branch primary
                        </Button>
                      ) : null}
                      <Button
                        variant="dangerOutline"
                        size="sm"
                        onClick={() => setRemoveBranchImage(image)}
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {edit.product.branchImages.length >= MAX_BRANCH_IMAGES ? (
              <p className="mt-3 text-sm text-slate-500">
                Maximum of {MAX_BRANCH_IMAGES} branch images reached.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <ImageField
                  inputLabel="Choose branch image"
                  triggerLabel="Choose branch image…"
                  file={imageFile}
                  onFileChange={setImageFile}
                  disabled={busy}
                />
                <label className="block text-sm font-semibold text-slate-700">
                  Description for this image (optional)
                  <input
                    type="text"
                    maxLength={200}
                    value={imageAlt}
                    onChange={(event) => setImageAlt(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={submitUploadBranchImage}
                  loading={busy}
                  loadingLabel="Uploading…"
                  disabled={!imageFile}
                >
                  Upload branch image
                </Button>
              </div>
            )}
          </section>

          <section
            aria-labelledby="hq-images-heading"
            className="mt-6 border-t border-slate-200 pt-4"
          >
            <h3 id="hq-images-heading" className="text-sm font-bold text-brand-navy">
              Images from Hungry Box HQ
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              These global product images are managed by Hungry Box HQ and cannot be changed from
              your branch. They are used whenever you have no branch image.
            </p>
            {edit.product.globalImages.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No global product images.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {sortImages<ProductImageDto>(edit.product.globalImages).map((image) => (
                  <li key={image.id}>
                    <img
                      src={image.imageUrl}
                      alt={image.altText ?? ''}
                      className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={closeEdit} disabled={busy}>
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

      <ConfirmDialog
        open={removeBranchImage !== null}
        title="Remove this branch image?"
        description="Customers at your branch will fall back to the Hungry Box image for this product."
        confirmLabel="Remove branch image"
        danger
        busy={busy && removeBranchImage !== null}
        busyLabel="Removing…"
        onConfirm={submitRemoveBranchImage}
        onClose={() => setRemoveBranchImage(null)}
      />
    </ManagerLayout>
  );
}
