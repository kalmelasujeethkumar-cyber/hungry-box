import type { JSX } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { SignOutButton } from '../../components/SignOutButton';
import { RealtimeIndicator } from '../../features/delivery/use-delivery-realtime';
import { HomeIcon, PackageIcon, UserIcon } from '../../features/storefront/components/icons';
import { HOME_PATH } from '../../routes/paths';

const NAV_ITEMS = [
  { to: '/delivery', label: 'Home', icon: HomeIcon, end: true },
  { to: '/delivery/deliveries', label: 'Deliveries', icon: PackageIcon, end: false },
  { to: '/delivery/profile', label: 'Profile', icon: UserIcon, end: false },
];

export default function DeliveryLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to={HOME_PATH} className="text-xl font-extrabold tracking-tight text-brand-navy">
            hungry box
          </Link>
          <div className="flex items-center gap-3">
            <RealtimeIndicator />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? 'flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-xs font-bold text-brand-teal'
                    : 'flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-xs font-medium text-slate-500'
                }
              >
                <Icon className="h-6 w-6" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}