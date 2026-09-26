import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { branchSettingsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { SignOutButton } from '../../components/SignOutButton';
import {
  HOME_PATH,
  MANAGER_ASSIGNMENTS_PATH,
  MANAGER_AUDIT_PATH,
  MANAGER_BASE_PATH,
  MANAGER_CATALOG_PATH,
  MANAGER_ORDERS_PATH,
  MANAGER_PARTNERS_PATH,
  MANAGER_SETTINGS_PATH,
} from '../../routes/paths';

const NAV = [
  { to: MANAGER_BASE_PATH, label: 'Overview' },
  { to: MANAGER_ORDERS_PATH, label: 'Orders' },
  { to: MANAGER_PARTNERS_PATH, label: 'Partners' },
  { to: MANAGER_ASSIGNMENTS_PATH, label: 'Assignments' },
  { to: MANAGER_CATALOG_PATH, label: 'Catalogue' },
  { to: MANAGER_SETTINGS_PATH, label: 'Settings' },
  { to: MANAGER_AUDIT_PATH, label: 'Audit' },
];

function ManagedBranchLabel(): JSX.Element | null {
  const { token, user } = useAuth();
  const [branchName, setBranchName] = useState<string | null>(null);

  const branchId = user?.branchId;

  useEffect(() => {
    if (!token || !branchId) return undefined;
    let cancelled = false;
    branchSettingsApi
      .get(token, branchId)
      .then((branch) => {
        if (!cancelled) setBranchName(branch.name);
      })
      .catch(() => {
        if (!cancelled) setBranchName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, branchId]);

  if (!branchName) return null;
  return (
    <span className="hidden shrink-0 rounded-full bg-brand-sky/60 px-2.5 py-0.5 text-xs font-bold text-brand-navy md:inline">
      {branchName}
    </span>
  );
}

export default function ManagerLayout({
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
          <Link
            to={HOME_PATH}
            className="shrink-0 text-xl font-extrabold tracking-tight text-brand-navy"
          >
            hungry <span className="text-brand-orange">box</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Manager navigation">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === MANAGER_BASE_PATH}
                className={({ isActive }) =>
                  [
                    'rounded-lg px-2.5 py-1.5 text-sm font-semibold',
                    isActive
                      ? 'bg-brand-sky/40 text-brand-navy'
                      : 'text-slate-600 hover:text-brand-teal',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden shrink-0 rounded-full bg-brand-sky/60 px-2.5 py-0.5 text-xs font-bold text-brand-navy sm:inline">
              Branch manager
            </span>
            <ManagedBranchLabel />
            <span className="hidden min-w-0 truncate text-sm text-slate-600 sm:inline">
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
          <div className="flex flex-wrap gap-2 lg:hidden" aria-label="Manager navigation (compact)">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === MANAGER_BASE_PATH}
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
