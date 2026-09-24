import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../features/storefront/cart-context';
import CartContents from '../../features/storefront/components/CartContents';
import EmptyState from '../../features/storefront/components/EmptyState';
import { CartIcon } from '../../features/storefront/components/icons';

export default function CartPage(): JSX.Element {
  const navigate = useNavigate();
  const { cart, loading, updateQuantity, removeItem } = useCart();

  if (!loading && (!cart || cart.items.length === 0)) {
    return (
      <EmptyState
        icon={<CartIcon className="h-8 w-8" />}
        title="Your cart is empty"
        message="Browse the menu and add something tasty before checking out."
      />
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
      aria-label="Cart"
    >
      <CartContents
        cart={cart}
        loading={loading}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        onCheckout={() => navigate('/customer/checkout')}
      />
    </section>
  );
}
