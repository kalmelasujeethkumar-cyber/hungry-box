import type { JSX } from 'react';
import type { CartSummary } from '@hungrybox/shared';
import { formatPaise } from '../../../lib/money';
import { TrashIcon } from './icons';

export default function CartContents({
  cart,
  loading,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}: {
  cart: CartSummary | null;
  loading: boolean;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onCheckout?: () => void;
}): JSX.Element {
  if (loading) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Loading your cart…</p>;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">
        Your cart is empty. Add items from the menu to get started.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {cart.items.map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-4">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.productName}
                className="h-16 w-16 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-sky text-xl font-black text-brand-teal">
                {item.productName.charAt(0)}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">
                  {item.productName}
                </h3>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="rounded p-1 text-slate-400 hover:text-brand-orange"
                  aria-label={`Remove ${item.productName} from cart`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <div
                  className="flex items-center rounded-lg border border-slate-200"
                  role="group"
                  aria-label={`Quantity of ${item.productName}`}
                >
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-l-lg text-slate-700 hover:text-brand-orange"
                    aria-label={`Decrease ${item.productName} quantity`}
                  >
                    −
                  </button>
                  <span className="min-w-7 text-center text-sm font-bold text-slate-800">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-700 hover:text-brand-teal"
                    aria-label={`Increase ${item.productName} quantity`}
                  >
                    +
                  </button>
                </div>
                <p className="text-sm font-bold text-slate-900">
                  {formatPaise(item.lineTotalMinor)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-slate-200 px-4 py-4 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Item total</span>
          <span>{formatPaise(cart.subtotalMinor)}</span>
        </div>
        {cart.discountMinor > 0 ? (
          <div className="flex justify-between text-brand-teal">
            <span>Discounts</span>
            <span>−{formatPaise(cart.discountMinor)}</span>
          </div>
        ) : null}
        <div className="flex justify-between pt-1 text-base font-extrabold text-slate-900">
          <span>To pay</span>
          <span>{formatPaise(cart.totalMinor)}</span>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={!onCheckout}
          className="mt-3 w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-bold text-white hover:bg-brand-orange/90 disabled:cursor-not-allowed disabled:bg-brand-navy disabled:opacity-60"
        >
          Proceed to checkout
        </button>
        <p className="pt-1 text-center text-xs text-slate-400">
          Prices are set by {cart.branch.name} and verified at the time of ordering.
        </p>
      </div>
    </div>
  );
}
