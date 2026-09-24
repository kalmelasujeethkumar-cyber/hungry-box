import type { JSX } from 'react';
import { NavLink } from 'react-router-dom';
import { useCart } from '../cart-context';
import { AddressIcon, CartIcon, HomeIcon, PackageIcon, UserIcon } from './icons';

const LINKS = [
  { to: '/customer/storefront', label: 'Home', icon: HomeIcon },
  { to: '/customer/cart', label: 'Cart', icon: CartIcon, badge: true },
  { to: '/customer/orders', label: 'Orders', icon: PackageIcon },
  { to: '/customer/addresses', label: 'Addresses', icon: AddressIcon },
  { to: '/customer/profile', label: 'Profile', icon: UserIcon },
];

export default function AppNav(): JSX.Element {
  const { cart } = useCart();
  const count = cart?.itemCount ?? 0;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white md:hidden"
      aria-label="Primary"
    >
      <ul className="flex">
        {LINKS.map((link) => (
          <li key={link.to} className="flex-1">
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${
                  isActive ? 'text-brand-navy' : 'text-slate-500'
                }`
              }
            >
              <span className="relative">
                <link.icon className="h-6 w-6" />
                {link.badge && count > 0 ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">
                    {count}
                  </span>
                ) : null}
              </span>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
