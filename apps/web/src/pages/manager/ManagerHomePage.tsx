import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import RoleHomeShell from '../../layouts/RoleHomeShell';
import { PackageIcon, UserIcon } from '../../features/storefront/components/icons';

export default function ManagerHomePage(): JSX.Element {
  const { user } = useAuth();

  return (
    <RoleHomeShell
      kicker="Branch Manager"
      title="Branch operations"
      intro={`Run delivery operations for your assigned branch${user?.branchId ? '' : ''}.`}
    >
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          to="/manager/partners"
          className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-brand-teal"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-sky text-brand-navy">
            <UserIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold text-brand-navy">Delivery partners</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Onboard, verify documents and manage partner availability for your branch.
          </p>
        </Link>
        <Link
          to="/manager/assignments"
          className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-brand-teal"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange">
            <PackageIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-extrabold text-brand-navy">Assignments</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Assign ready orders to online partners and track delivery progress.
          </p>
        </Link>
      </div>
    </RoleHomeShell>
  );
}