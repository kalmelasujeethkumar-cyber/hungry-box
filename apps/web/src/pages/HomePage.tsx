import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { homePathForRole } from '../auth/role-paths';
import { LOGIN_PATH } from '../routes/paths';

const BRAND_SWATCHES = [
  { name: 'brand-teal', className: 'bg-brand-teal' },
  { name: 'brand-sky', className: 'bg-brand-sky' },
  { name: 'brand-navy', className: 'bg-brand-navy' },
  { name: 'brand-orange', className: 'bg-brand-orange' },
  { name: 'brand-yellow', className: 'bg-brand-yellow' },
] as const;

export default function HomePage(): JSX.Element {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange">
        Phase 2 · Identity, access & catalog seed
      </p>
      <h1 className="mt-4 text-5xl font-extrabold tracking-tight text-brand-navy">hungry box</h1>
      <p className="mt-4 max-w-md text-base text-slate-600">
        A multi-branch food delivery platform. Sign in to continue to your role-based workspace.
      </p>

      <div className="mt-8 flex items-center gap-3">
        {user ? (
          <Link
            to={homePathForRole(user.role)}
            className="rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            Continue as {user.name ?? user.loginId}
          </Link>
        ) : (
          <Link
            to={LOGIN_PATH}
            className="rounded-lg bg-brand-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-orange/90"
          >
            Sign in
          </Link>
        )}
      </div>

      <div className="mt-10 flex items-center gap-3" aria-label="Hungry Box brand palette">
        {BRAND_SWATCHES.map((swatch) => (
          <span
            key={swatch.name}
            className={`h-8 w-8 rounded-full border border-slate-200 ${swatch.className}`}
            title={swatch.name}
          />
        ))}
      </div>
    </main>
  );
}
