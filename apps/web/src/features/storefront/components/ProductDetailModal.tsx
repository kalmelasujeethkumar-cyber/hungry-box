import type { JSX } from 'react';
import type { CatalogProductDetail } from '@hungrybox/shared';
import { formatPaise } from '../../../lib/money';
import { useCart } from '../cart-context';
import { CloseIcon } from './icons';

export default function ProductDetailModal({
  detail,
  onClose,
  onAdd,
  onUpdateQuantity,
}: {
  detail: CatalogProductDetail;
  onClose: () => void;
  onAdd: (productId: string) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
}): JSX.Element {
  const { cart } = useCart();
  const inCart = cart?.items.find((item) => item.productId === detail.productId) ?? null;
  const quantity = inCart?.quantity ?? 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          {detail.imageUrl ? (
            <img src={detail.imageUrl} alt={detail.name} className="h-56 w-full object-cover" />
          ) : (
            <div className="flex h-56 w-full items-center justify-center bg-brand-sky text-6xl font-black text-brand-teal">
              {detail.name.charAt(0)}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Close product details"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {detail.categoryName ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
              {detail.categoryName}
            </p>
          ) : null}
          <h2 id="product-detail-title" className="mt-1 text-xl font-extrabold text-brand-navy">
            {detail.name}
          </h2>
          {detail.description ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.description}</p>
          ) : null}

          <div className="mt-4 flex items-end gap-2">
            <span className="text-lg font-extrabold text-slate-900">
              {formatPaise(detail.effectivePriceMinor)}
            </span>
            {detail.discountMinor > 0 ? (
              <span className="text-sm text-slate-400 line-through">
                {formatPaise(detail.priceMinor)}
              </span>
            ) : null}
            {detail.discountMinor > 0 ? (
              <span className="rounded bg-brand-yellow px-1.5 py-0.5 text-xs font-bold text-slate-800">
                {Math.round((detail.discountMinor / detail.priceMinor) * 100)}% off
              </span>
            ) : null}
          </div>

          {detail.isAvailable ? (
            <div className="mt-5 flex items-center gap-3">
              {quantity > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(detail.productId, quantity - 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-slate-700 hover:border-brand-orange hover:text-brand-orange"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-base font-bold text-slate-800">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(detail.productId, quantity + 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onAdd(detail.productId)}
                  className="w-full rounded-lg bg-brand-orange px-6 py-3 text-base font-bold text-white hover:bg-brand-orange/90"
                >
                  Add to cart
                </button>
              )}
            </div>
          ) : (
            <p className="mt-5 rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">
              This item is temporarily unavailable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
