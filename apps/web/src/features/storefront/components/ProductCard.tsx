import type { JSX } from 'react';
import type { CatalogProduct } from '@hungrybox/shared';
import { ProductImage } from '../../../components/ProductImage';
import { formatPaise } from '../../../lib/money';
import { useCart } from '../cart-context';

export default function ProductCard({
  product,
  onAdd,
  onUpdateQuantity,
  onView,
}: {
  product: CatalogProduct;
  onAdd: (product: CatalogProduct) => void;
  onUpdateQuantity: (product: CatalogProduct, quantity: number) => void;
  onView: (product: CatalogProduct) => void;
}): JSX.Element {
  const { cart } = useCart();
  const inCart = cart?.items.find((item) => item.productId === product.productId) ?? null;

  function view(): void {
    onView(product);
  }

  return (
    <article className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={view}
        aria-label={`View ${product.name}`}
        className="h-28 w-28 shrink-0 sm:h-32 sm:w-32"
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          fallback={product.name.charAt(0)}
          className="h-full w-full"
          fallbackClassName="text-3xl"
        />
      </button>

      <div className="flex min-w-0 flex-1 flex-col p-3">
        <button type="button" onClick={view} className="text-left">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-800 hover:text-brand-teal">
            {product.name}
          </h3>
        </button>
        {product.categoryName ? (
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-brand-orange">
            {product.categoryName}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between pt-2">
          <p className="flex flex-col">
            <span className="font-bold text-slate-900">
              {formatPaise(product.effectivePriceMinor)}
            </span>
            {product.discountMinor > 0 ? (
              <span className="text-xs text-slate-400 line-through">
                {formatPaise(product.priceMinor)}
              </span>
            ) : null}
          </p>

          {product.isAvailable ? (
            inCart ? (
              <AmountEditor product={product} onUpdateQuantity={onUpdateQuantity} />
            ) : (
              <button
                type="button"
                onClick={() => onAdd(product)}
                className="rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-orange/90"
                aria-label={`Add ${product.name} to cart`}
              >
                ADD
              </button>
            )
          ) : (
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
              Sold out
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function AmountEditor({
  product,
  onUpdateQuantity,
}: {
  product: CatalogProduct;
  onUpdateQuantity: (product: CatalogProduct, quantity: number) => void;
}): JSX.Element {
  const { cart } = useCart();
  const item = cart?.items.find((entry) => entry.productId === product.productId);
  const quantity = item?.quantity ?? 0;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onUpdateQuantity(product, quantity - 1)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-slate-700 hover:border-brand-orange hover:text-brand-orange"
        aria-label={`Decrease ${product.name} quantity`}
      >
        −
      </button>
      <span className="min-w-6 text-center text-sm font-bold text-slate-800">{quantity}</span>
      <button
        type="button"
        onClick={() => onUpdateQuantity(product, quantity + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-slate-700 hover:border-brand-teal hover:text-brand-teal"
        aria-label={`Increase ${product.name} quantity`}
      >
        +
      </button>
    </div>
  );
}
