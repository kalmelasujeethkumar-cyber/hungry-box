import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';
import { CartProvider } from '../features/storefront/cart-context';
import AppNav from '../features/storefront/components/AppNav';
import CartSheet from '../features/storefront/components/CartSheet';
import LocationModal from '../features/storefront/components/LocationModal';
import StorefrontHeader from '../features/storefront/components/StorefrontHeader';
import { StorefrontProvider } from '../features/storefront/storefront-context';

export default function CustomerLayout(): JSX.Element {
  return (
    <StorefrontProvider>
      <CartProvider>
        <div className="min-h-screen bg-slate-50">
          <StorefrontHeader />
          <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 md:pb-10">
            <Outlet />
          </main>
          <AppNav />
          <CartSheet />
          <LocationModal />
        </div>
      </CartProvider>
    </StorefrontProvider>
  );
}
