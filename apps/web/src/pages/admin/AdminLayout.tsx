import type { JSX, ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { SignOutButton } from '../../components/SignOutButton';
import { HOME_PATH } from '../../routes/paths';

const NAV = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/branches', label: 'Branches' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/catalogue', label: 'Catalogue' },
  { to: '/admin/managers', label: 'Managers' },
  { to: '/admin/partners', label: 'Partners' },
  { to: '/admin/audit', label: 'Audit' },
  { to: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}): JSX.Element {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link to={HOME_PATH} className="text-xl font-extrabold tracking-tight text-brand-navy">
            hungry box
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Admin navigation">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  [
                    'rounded-lg px-2.5 py-1.5 text-sm font-semibold',
                    isActive ? 'bg-brand-sky/40 text-brand-navy' : 'text-slate-600 hover:text-brand-teal',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.name ?? user?.loginId}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
              {kicker}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-navy">{title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 lg:hidden" aria-label="Admin navigation">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  [
                    'rounded-lg px-3 py-1.5 text-sm font-semibold',
                    isActive ? 'bg-brand-teal text-white' : 'bg-brand-sky/40 text-brand-navy',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
