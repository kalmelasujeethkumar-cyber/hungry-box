import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { HOME_PATH } from '../routes/paths';

export default function RoleHomeShell({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: string;
  children?: ReactNode;
}): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to={HOME_PATH} className="text-xl font-extrabold tracking-tight text-brand-navy">
            hungry box
          </Link>
          <nav className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{user?.name ?? user?.loginId}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-teal hover:text-brand-teal"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
          {kicker}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-navy">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{intro}</p>
        {children}
      </section>
    </main>
  );
}
