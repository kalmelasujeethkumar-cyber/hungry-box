import type { JSX } from 'react';
import { useAuth } from '../../auth/auth-context';
import { PageHeader } from '../../components/PageHeader';
import { SignOutButton } from '../../components/SignOutButton';

export function ProfilePage(): JSX.Element {
  const { user } = useAuth();

  return (
    <section className="mx-auto max-w-md">
      <PageHeader
        title="Profile"
        subtitle="Your account details and sign out."
      />
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
      <div className="mt-4">
        <SignOutButton className="w-full" size="md" />
      </div>
    </section>
  );
}
