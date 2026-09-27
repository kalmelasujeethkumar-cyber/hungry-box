import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { BranchDto } from '@hungrybox/shared';
import { branchesApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { Notice } from '../../components/Notice';
import { AuditLogPanel } from '../../features/audit/AuditLogPanel';
import AdminLayout from './AdminLayout';

export default function AdminAuditPage(): JSX.Element {
  const { token } = useAuth();
  const [branches, setBranches] = useState<BranchDto[] | undefined>(undefined);
  const [branchError, setBranchError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    branchesApi
      .list(token)
      .then((loaded) => {
        if (!cancelled) setBranches(loaded);
      })
      .catch((err: unknown) => {
        /**
         * Reported rather than swallowed. This list is what names the branches in the log
         * and populates the branch filter, so a silent failure left the super admin reading
         * a full-fleet log with every entry showing a bare branch id and no way to tell
         * that the branch filter had failed rather than simply having nothing to offer.
         */
        if (!cancelled) {
          setBranches([]);
          setBranchError(
            err instanceof Error ? err.message : 'Could not load the branch filter.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AdminLayout kicker="Global operations" title="Audit log">
      {branchError ? (
        <Notice tone="warning" className="mt-4">
          {branchError} The log below covers every branch and shows raw branch ids.
        </Notice>
      ) : null}
      <AuditLogPanel
        token={token}
        emptyMessage="Platform activity will be recorded here as it happens."
        branches={branches}
      />
    </AdminLayout>
  );
}
