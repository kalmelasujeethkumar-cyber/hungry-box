import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth/auth-context';
import { useCart } from '../cart-context';
import { useStorefront } from '../storefront-context';
import { CartIcon, LocationIcon } from './icons';

export default function StorefrontHeader(): JSX.Element {
  const { user, logout } = useAuth();
  const { branch, status, setLocationsOpen } = useStorefront();
  const { hasItems, cart, setCartOpen } = useCart();

  const locationLabel = branch ? `${branch.name} · ${branch.city}` : 'Set delivery location';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link
          to="/customer/storefront"
          className="text-xl font-extrabold tracking-tight text-brand-navy"
        >
          hungry box
        </Link>

        <button
          type="button"
          onClick={() => setLocationsOpen(true)}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-teal hover:text-brand-teal"
          aria-label={locationLabel}
        >
          <LocationIcon className="h-4 w-4 shrink-0 text-brand-teal" />
          <span className="truncate">{locationLabel}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative rounded-lg bg-brand-navy px-3 py-2 text-white hover:bg-brand-navy/90"
            aria-label={`Open cart${hasItems ? ` (${cart?.itemCount ?? 0} items)` : ''}`}
          >
            <CartIcon className="h-5 w-5" />
            {hasItems ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1 text-xs font-bold text-white">
                {cart?.itemCount}
              </span>
            ) : null}
          </button>
          <span className="hidden text-sm text-slate-600 sm:inline">
            {user?.name ?? user?.loginId}
          </span>
          {branch && status === 'ready' ? (
            <span className="hidden text-xs text-slate-500 md:inline">
              {branch.deliveryRadiusKm} km delivery radius
            </span>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-teal hover:text-brand-teal sm:inline"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
