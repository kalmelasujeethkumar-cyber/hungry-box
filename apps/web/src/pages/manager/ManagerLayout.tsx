import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { HOME_PATH } from '../../routes/paths';

const NAV = [
  { to: '/manager', label: 'Overview' },
  { to: '/manager/orders', label: 'Orders' },
  { to: '/manager/partners', label: 'Partners' },
  { to: '/manager/assignments', label: 'Assignments' },
  { to: '/manager/catalog', label: 'Catalogue' },
  { to: '/manager/settings', label: 'Settings' },
  { to: '/manager/audit', label: 'Audit' },
];

export default function ManagerLayout({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link to={HOME_PATH} className="text-xl font-extrabold tracking-tight text-brand-navy">
            hungry box
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:text-brand-teal"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user?.name ?? user?.loginId}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-teal hover:text-brand-teal"
            >
              Sign out
            </button>
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
          <div className="flex flex-wrap gap-2 lg:hidden" aria-label="Manager navigation">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg bg-brand-sky/40 px-3 py-1.5 text-sm font-semibold text-brand-navy"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
