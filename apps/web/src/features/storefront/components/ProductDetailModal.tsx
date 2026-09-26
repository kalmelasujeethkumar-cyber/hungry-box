import type { JSX } from 'react';
import type { CatalogProductDetail } from '@hungrybox/shared';
import { Dialog } from '../../../components/Dialog';
import { ProductImage } from '../../../components/ProductImage';
import { formatPaise } from '../../../lib/money';
import { useCart } from '../cart-context';

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
    <Dialog open onClose={onClose} title={detail.name}>
      <ProductImage
        src={detail.imageUrl}
        alt={detail.name}
        fallback={detail.name.charAt(0)}
        className="h-48 w-full rounded-xl"
        fallbackClassName="text-5xl"
      />

      <div className="mt-4">
        {detail.categoryName ? (
          <p className="text-xs font-bold uppercase tracking-widest text-brand-orange">
            {detail.categoryName}
          </p>
        ) : null}
        {detail.description ? (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail.description}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-lg font-extrabold text-slate-900">
            {formatPaise(detail.effectivePriceMinor)}
          </span>
          {detail.discountMinor > 0 ? (
            <span className="text-sm text-slate-400 line-through">
              {formatPaise(detail.priceMinor)}
            </span>
          ) : null}
          {detail.discountMinor > 0 && detail.priceMinor > 0 ? (
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
    </Dialog>
  );
}