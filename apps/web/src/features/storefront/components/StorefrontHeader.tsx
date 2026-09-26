import type { JSX } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../../auth/auth-context';
import { SignOutButton } from '../../../components/SignOutButton';
import { useCart } from '../cart-context';
import { useStorefront } from '../storefront-context';
import { AddressIcon, CartIcon, HomeIcon, LocationIcon, PackageIcon, UserIcon } from './icons';

const NAV_LINKS = [
  { to: '/customer/storefront', label: 'Home', icon: HomeIcon },
  { to: '/customer/orders', label: 'Orders', icon: PackageIcon },
  { to: '/customer/addresses', label: 'Addresses', icon: AddressIcon },
  { to: '/customer/profile', label: 'Profile', icon: UserIcon },
] as const;

export default function StorefrontHeader(): JSX.Element {
  const { user } = useAuth();
  const { branch, setLocationsOpen } = useStorefront();
  const { hasItems, cart, setCartOpen } = useCart();

  const locationLabel = branch ? `${branch.name} · ${branch.city}` : 'Set delivery location';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link
          to="/customer/storefront"
          className="text-xl font-extrabold tracking-tight text-brand-navy"
        >
          hungry <span className="text-brand-orange">box</span>
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

        <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 text-sm font-bold ${
                  isActive ? 'text-brand-navy' : 'text-slate-500 hover:text-brand-teal'
                }`
              }
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>

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
          <span className="hidden text-sm text-slate-600 lg:inline">
            {user?.name ?? user?.loginId}
          </span>
          <span className="hidden sm:inline">
            <SignOutButton size="md" />
          </span>
        </div>
      </div>
    </header>
  );
}
