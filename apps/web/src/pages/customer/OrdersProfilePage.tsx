import type { JSX } from 'react';
import { useAuth } from '../../auth/auth-context';

export function ProfilePage(): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold tracking-tight text-brand-navy">Profile</h1>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <dl className="divide-y divide-slate-100">
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-slate-500">Name</dt>
            <dd className="text-sm font-semibold text-slate-800">{user?.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-slate-500">Login</dt>
            <dd className="text-sm font-semibold text-slate-800">{user?.loginId}</dd>
          </div>
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-slate-500">Role</dt>
            <dd className="text-sm font-semibold text-slate-800">Customer</dd>
          </div>
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-slate-500">Status</dt>
            <dd className="text-sm font-semibold text-slate-800">{user?.status}</dd>
          </div>
        </dl>
      </div>
      <button
        type="button"
        onClick={logout}
        className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-orange hover:text-brand-orange"
      >
        Sign out
      </button>
    </section>
  );
}
