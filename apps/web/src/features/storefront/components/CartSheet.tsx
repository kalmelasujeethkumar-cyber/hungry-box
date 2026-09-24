import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart-context';
import CartContents from './CartContents';
import { CloseIcon } from './icons';

export default function CartSheet(): JSX.Element | null {
  const navigate = useNavigate();
  const { cart, loading, cartOpen, setCartOpen, updateQuantity, removeItem } = useCart();

  if (!cartOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-sheet-title"
      onClick={() => setCartOpen(false)}
    >
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <h2 id="cart-sheet-title" className="text-lg font-bold text-brand-navy">
            Your cart
          </h2>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:text-brand-navy"
            aria-label="Close cart"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <CartContents
            cart={cart}
            loading={loading}
            onUpdateQuantity={updateQuantity}
            onRemove={removeItem}
            onCheckout={() => {
              setCartOpen(false);
              navigate('/customer/checkout');
            }}
          />
        </div>
      </aside>
    </div>
  );
}
